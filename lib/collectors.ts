import { extractResults } from "./results-extraction";
import type { FinancialResults } from "./financials";
import { z } from "zod";
import { fetchWithBackoff, canonicalSource } from "./source-fetch";
import { load } from "cheerio";
import { getDocumentProxy } from "unpdf";
import {
  classify,
  completedSession,
  marketStats,
  type Company,
  type DocumentRecord,
  type Evidence,
  type Filing,
  type MarketData,
} from "./domain";
import { reconcileMetadata, canonicalTitle } from "./provenance";
import { extractPassages, PASSAGE_PARSER } from "./passages";

const trusted = [
  "screener.in",
  "nseindia.com",
  "nseindia.in",
  "bseindia.com",
  "query1.finance.yahoo.com",
  "query2.finance.yahoo.com",
];
export function sourceKey(url: string) {
  const u = new URL(url);
  if (u.hostname.endsWith("bseindia.com")) {
    const match = url.match(
      /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i,
    );
    if (match) return "bse:" + match[0].toLowerCase();
  }
  return u.href;
}
export function validateUrl(url: string, companyHost?: string) {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443")
  )
    throw new Error("Only public HTTPS source URLs are allowed");
  if (
    !u.hostname.includes(".") ||
    /^[\d.]+$/.test(u.hostname) ||
    u.hostname.includes(":") ||
    /\.(local|localhost|internal|test|invalid)$/.test(u.hostname)
  )
    throw new Error("Private or literal network destinations are not allowed");
  const allowed = [...trusted, ...(companyHost ? [companyHost] : [])];
  if (
    !allowed.some(
      (host) => u.hostname === host || u.hostname.endsWith("." + host),
    )
  )
    throw new Error(
      "Source host is not an exchange or the verified company website",
    );
  return u;
}
export async function fetchSource(
  url: string,
  companyHost?: string,
  maxBytes = 32 * 1024 * 1024,
): Promise<{ bytes: Uint8Array; url: string; type: string }> {
  let current = url;
  for (let redirects = 0; redirects < 5; redirects++) {
    validateUrl(current, companyHost);
    const response = await fetchWithBackoff(current);
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location");
      if (!next) throw new Error("Source redirect has no location");
      current = new URL(next, current).href;
      continue;
    }
    if (!response.ok)
      throw new Error(`Source returned HTTP ${response.status}`);
    if (Number(response.headers.get("content-length")) > maxBytes)
      throw new Error(
        `Source exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB download limit`,
      );
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty response");
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > maxBytes)
          throw new Error("Source exceeds the download limit");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const bytes = new Uint8Array(length);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.length;
    }
    return {
      bytes,
      url: current,
      type: response.headers.get("content-type") ?? "",
    };
  }
  throw new Error("Too many redirects");
}
export async function sha256(bytes: Uint8Array | string) {
  const input =
    typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  const digest = await crypto.subtle.digest("SHA-256", input as BufferSource);
  return [...new Uint8Array(digest)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function fetchMarket(
  symbol: string,
  now = new Date(),
): Promise<MarketData> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}.NS?range=3mo&interval=1d&events=splits`;
  const { bytes } = await fetchSource(url);
  const json = JSON.parse(new TextDecoder().decode(bytes));
  const r = z
    .object({
      timestamp: z.array(z.number()),
      indicators: z.object({
        quote: z.array(
          z.object({
            close: z.array(z.number().nullable()),
            volume: z.array(z.number().nullable()),
          }),
        ),
        adjclose: z
          .array(z.object({ adjclose: z.array(z.number().nullable()) }))
          .optional(),
      }),
      events: z
        .object({ splits: z.record(z.object({ date: z.number() })).optional() })
        .optional(),
      meta: z.object({ currency: z.string() }),
    })
    .optional()
    .parse(json.chart?.result?.[0]);
  if (!r?.timestamp?.length)
    throw new Error("Price provider returned no daily observations");
  const quote = r.indicators.quote[0],
    adj = r.indicators.adjclose?.[0]?.adjclose ?? [];
  const splits = new Set(
    Object.values(r.events?.splits ?? {}).map((e) =>
      new Date(e.date * 1000).toISOString().slice(0, 10),
    ),
  );
  const bars = r.timestamp
    .map((t: number, i: number) => ({
      date: new Date(t * 1000).toISOString().slice(0, 10),
      close: quote.close[i],
      adjustedClose: adj[i] ?? quote.close[i],
      volume: quote.volume[i],
      split: splits.has(new Date(t * 1000).toISOString().slice(0, 10)),
    }))
    .filter(
      (
        b,
      ): b is {
        date: string;
        close: number;
        adjustedClose: number;
        volume: number;
        split: boolean;
      } =>
        b.close !== null &&
        b.adjustedClose !== null &&
        b.volume !== null &&
        completedSession(b.date, now),
    );
  return {
    symbol,
    bars,
    ...marketStats(bars),
    source: "Yahoo Finance",
    url,
    currency: r.meta.currency,
    basis:
      "Unadjusted close; split sessions suppressed. Volume uses the previous 20 sessions.",
    fetchedAt: new Date().toISOString(),
  };
}
const formatNse = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`;
export function nseTime(value: string) {
  const [date, time = "00:00:00"] = value.split(" ");
  if (/^\d{4}-\d{2}-\d{2}$/.test(date))
    return new Date(`${date}T${time}+05:30`).toISOString();
  const [day, mon, year] = date.split("-");
  const month =
    [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ].indexOf(mon) + 1;
  return new Date(
    `${year}-${String(month).padStart(2, "0")}-${day}T${time}+05:30`,
  ).toISOString();
}
export async function fetchFilings(
  symbol: string,
  from: Date,
  to: Date,
): Promise<Filing[]> {
  const url = `https://www.nseindia.com/api/corporate-announcements?index=equities&symbol=${encodeURIComponent(symbol)}&from_date=${formatNse(from)}&to_date=${formatNse(to)}`;
  const { bytes } = await fetchSource(url);
  const rows = z
    .array(
      z.object({
        symbol: z.string(),
        attchmntFile: z.string().nullable().optional(),
        seq_id: z.union([z.string(), z.number()]),
        sm_name: z.string(),
        desc: z.string(),
        attchmntText: z.string().nullable().optional(),
        sort_date: z.string().optional(),
        an_dt: z.string(),
      }),
    )
    .parse(JSON.parse(new TextDecoder().decode(bytes)));
  if (rows.length >= 500) {
    if (to.getTime() - from.getTime() < 86400000)
      throw new Error(
        "Exchange response may be capped; one-day coverage needs reconciliation",
      );
    const mid = new Date(Math.floor((from.getTime() + to.getTime()) / 2));
    const a = await fetchFilings(symbol, from, mid),
      b = await fetchFilings(symbol, mid, to);
    return [...new Map([...a, ...b].map((r) => [r.id, r])).values()];
  }
  return rows
    .filter((r) => r.symbol === symbol && r.attchmntFile)
    .map((r) => ({
      id: `nse-${r.seq_id}`,
      symbol,
      company: r.sm_name,
      title: r.desc,
      description: r.attchmntText ?? r.desc,
      ...classify(r.desc, r.attchmntText ?? ""),
      publishedAt: nseTime(r.sort_date || r.an_dt),
      url: r.attchmntFile!,
      source: "NSE",
      mode: "live" as const,
    }));
}
export type DiscoveredDocument = {
  url: string;
  title: string;
  type: string;
  period: string;
  publishedAt: string | null;
};
export async function discover(company: Company): Promise<{
  documents: DiscoveredDocument[];
  companyHost: string;
  url: string;
}> {
  const url = `https://www.screener.in/company/${encodeURIComponent(company.symbol)}/consolidated/`;
  const { bytes } = await fetchSource(url);
  const $ = load(new TextDecoder().decode(bytes));
  const nseLink = $("a")
    .toArray()
    .some(
      (a) =>
        $(a).text().replace(/\s+/g, " ").trim() === `NSE: ${company.symbol}`,
    );
  if (!nseLink)
    throw new Error("Discovery page did not confirm the NSE company identity");
  const website = $("a")
    .toArray()
    .find(
      (a) =>
        $(a).find("i.icon-link").length > 0 &&
        /^https?:/.test($(a).attr("href") ?? ""),
    );
  const websiteUrl = website ? $(website).attr("href") : null;
  const companyHost = websiteUrl
    ? new URL(websiteUrl).hostname.replace(/^www\./, "")
    : "";
  const documents: DiscoveredDocument[] = [];
  $(".annual-reports a").each((_, a) => {
    const title = $(a).text().trim(),
      href = $(a).attr("href");
    if (
      href &&
      /Annual Report \d{4}/.test(title) &&
      documents.filter((d) => d.type === "annual_report").length < 1
    )
      documents.push({
        url: new URL(href, url).href,
        title,
        type: "annual_report",
        period: title.match(/\d{4}/)![0],
        publishedAt: null,
      });
  });
  $(".concalls li")
    .slice(0, 4)
    .each((_, li) => {
      const period = $(li).find("div").first().text().trim();
      $(li)
        .find("a")
        .each((_, a) => {
          if ($(a).text().trim() !== "Transcript") return;
          const href = $(a).attr("href");
          if (href)
            documents.push({
              url: new URL(href, url).href,
              title: `Earnings-call transcript · ${period}`,
              type: "transcript",
              period,
              publishedAt: null,
            });
        });
    });
  return { documents, companyHost, url };
}
export async function parseDocument(
  company: Company,
  input: DiscoveredDocument,
  companyHost?: string,
  maxBytes = 32 * 1024 * 1024,
): Promise<{
  document: DocumentRecord;
  passages: Evidence[];
  results: FinancialResults | null;
}> {
  const { bytes, url } = await fetchSource(
    canonicalSource(input.url),
    companyHost,
    maxBytes,
  );
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
    throw new Error("Source did not return a PDF");
  const hash = await sha256(bytes),
    id = `doc-${hash.slice(0, 20)}`;
  const pdf = await getDocumentProxy(bytes, {
    isEvalSupported: false,
    useSystemFonts: false,
    maxImageSize: 1000000,
  });
  try {
    if (pdf.numPages > 550) throw new Error("PDF exceeds the 550-page limit");
    // Page-by-page parsing avoids unbounded parallel work for annual reports.
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const c = await page.getTextContent();
      pages.push(
        c.items
          .map((x) =>
            "str" in x ? x.str + ("hasEOL" in x && x.hasEOL ? "\n" : " ") : "",
          )
          .join("")
          .trim(),
      );
      page.cleanup();
    }
    const first = pages
      .slice(0, 8)
      .join(" ")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const token = company.name
      .replace(/limited|ltd|technologies/gi, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
    if (
      !first.includes(company.symbol.toLowerCase()) &&
      !first.includes(token.slice(0, Math.min(8, token.length))) &&
      !first.includes(company.isin.toLowerCase())
    )
      throw new Error("PDF company identity could not be verified");
    if (pages.join("").length < 150)
      throw new Error("PDF has no usable text; OCR is not enabled");
    // The date in a period label is not assumed to be the publication date.
    const metadata = reconcileMetadata(pages, input.type, input.period);
    const document: DocumentRecord = {
      id,
      symbol: company.symbol,
      ...input,
      originalUrl: input.url,
      url,
      source: new URL(url).hostname,
      fetchedAt: new Date().toISOString(),
      hash,
      parser: PASSAGE_PARSER,
      status: "extracted",
      pages: pdf.numPages,
      identity: "Company name, ticker or ISIN matched in the first eight pages",
      metadata,
      title: canonicalTitle(input.type, metadata, input.title),
    };
    const passages = extractPassages(document, pages);
    if (!passages.length) {
      document.status = "partial";
      document.error =
        "Company identity was found, but no relevant text passages were extracted. The PDF may require OCR.";
    }
    return { document, passages, results: extractResults(document, pages) };
  } finally {
    await pdf.destroy();
  }
}
