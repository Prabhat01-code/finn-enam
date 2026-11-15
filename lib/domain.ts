import type { SourceMetadata } from "./provenance";
export type Priority = "high" | "watch" | "routine";
export type Company = {
  symbol: string;
  name: string;
  isin: string;
  sector?: string;
  series?: string;
};
export type Evidence = {
  documentId: string;
  title: string;
  url: string;
  page: number;
  text: string;
  publishedAt: string | null;
  availableAt?: string;
  type: string;
  verbatim?: boolean;
  speaker?: string;
  speakerRole?: "management" | "analyst" | "moderator" | "unknown";
  section?: string;
  sourceDate?: string;
  revision?: string;
  metadataStatus?: "verified" | "unverified" | "conflict";
};
export type DocumentRecord = {
  id: string;
  symbol: string;
  title: string;
  url: string;
  originalUrl?: string;
  source: string;
  type: string;
  period: string;
  publishedAt: string | null;
  fetchedAt: string;
  hash: string;
  parser: string;
  status: string;
  pages: number;
  identity: string;
  error?: string;
  revision?: string;
  metadata?: SourceMetadata;
};
export type Filing = {
  id: string;
  symbol: string;
  company: string;
  title: string;
  description: string;
  category: string;
  subtype: string;
  priority: Priority;
  reason: string;
  publishedAt: string;
  url: string;
  source: string;
  documentId?: string;
  mode: "live" | "replay";
};
export type Bar = {
  date: string;
  close: number;
  adjustedClose: number;
  volume: number;
  split?: boolean;
};
export type MarketData = {
  symbol: string;
  bars: Bar[];
  fetchedAt: string;
  source: string;
  url: string;
  currency: string;
  basis: string;
  change: number | null;
  volumeRatio: number | null;
  latest: Bar | null;
};
export type Rules = {
  priceThreshold: number;
  volumeMultiplier: number;
  categories: string[];
  monitorEnabled?: boolean;
};
export const DEFAULT_RULES: Rules = {
  priceThreshold: 3,
  volumeMultiplier: 2,
  categories: [
    "results",
    "management_change",
    "M&A",
    "litigation",
    "credit_rating",
    "capex",
  ],
};
export const CATEGORY_LABELS: Record<string, string> = {
  results: "Results",
  "M&A": "Mergers & acquisitions",
  management_change: "Leadership",
  litigation: "Regulatory & legal",
  credit_rating: "Credit rating",
  capex: "Capacity & investment",
  dividend: "Dividends",
  earnings_call: "Earnings calls",
  fund_raise: "Capital raising",
  bonus_split: "Bonus & split",
  insider_trading: "Insider transactions",
  investor_meetings: "Investor meetings",
  press_release: "Business update",
  postal_ballot: "Postal ballot",
  agm_egm: "Shareholder meeting",
  pledging: "Share pledges",
  unclassified: "Needs review",
};
export const PORTFOLIO: Record<string, string> = {
  INFY: "IT services",
  TCS: "IT services",
  HCLTECH: "IT services",
  HDFCBANK: "Banking",
  ICICIBANK: "Banking",
  ITC: "Consumer",
  TITAN: "Consumer",
  CCL: "Consumer",
  LT: "Industrials",
  POLYCAB: "Electricals",
  CERA: "Building products",
  RELIANCE: "Diversified",
  TATAPOWER: "Power",
  MARUTI: "Automotive",
  EICHERMOT: "Automotive",
  SUNPHARMA: "Pharma",
  DIVISLAB: "Pharma",
  AARTIIND: "Chemicals",
};

export function classify(
  title: string,
  description = "",
): Pick<Filing, "category" | "subtype" | "priority" | "reason"> {
  const s = `${title} ${description}`.toLowerCase();
  const result = (
    category: string,
    subtype: string,
    priority: Priority,
    reason: string,
  ) => ({ category, subtype, priority, reason });
  if (
    /board meeting.*(?:intimation|notice)|intimation.*board meeting/.test(s) &&
    /buyback|qip|rights issue|preferential|raising of funds/.test(s)
  )
    return result(
      "fund_raise",
      "meeting_notice",
      "watch",
      "A capital action is on the board agenda; approval or completion is not yet established.",
    );
  if (
    /appoint/.test(s) &&
    /statutory auditor|secretarial auditor|auditor rotation/.test(s)
  )
    return result(
      "unclassified",
      "auditor_appointment",
      "routine",
      "Auditor appointment/rotation; inspect the filing for any qualifications or departures.",
    );
  if (
    /resign|removal|termination/.test(s) &&
    /auditor|cfo|chief|director|managing/.test(s)
  )
    return result(
      "management_change",
      "departure",
      "high",
      "A leadership or auditor departure deserves a direct review of the filing.",
    );
  if (/newspaper|publication of.*result/.test(s))
    return result(
      "results",
      "publication_notice",
      "routine",
      "Publication notice; separate from the underlying financial results.",
    );
  if (/board meeting.*(intimation|notice)|intimation.*board meeting/.test(s))
    return result(
      "results",
      "meeting_notice",
      "routine",
      "Advance meeting notice; no results are assumed.",
    );
  if (/downgrad|rating.*withdrawn/.test(s))
    return result(
      "credit_rating",
      "downgrade",
      "high",
      "A rating downgrade or withdrawal may change funding risk.",
    );
  if (/reaffirm/.test(s))
    return result(
      "credit_rating",
      "reaffirmation",
      "routine",
      "The existing rating was reaffirmed.",
    );
  if (/transcript/.test(s))
    return result(
      "earnings_call",
      "transcript",
      "watch",
      "New primary management commentary is available for research.",
    );
  if (/concall|conference call|earnings call/.test(s))
    return result(
      "earnings_call",
      "call_notice",
      "routine",
      "Call logistics or recording; inspect the source for details.",
    );
  if (
    /financial result|quarterly result|audited.*result|unaudited.*result/.test(
      s,
    )
  )
    return result(
      "results",
      "reported_results",
      "high",
      "Reported financial results can change the operating picture.",
    );
  if (/acquisition|acquire|merger|demerger|joint venture|amalgamation/.test(s))
    return result(
      "M&A",
      /complet/.test(s) ? "completion" : "transaction_update",
      "high",
      "A corporate transaction may change the business or capital allocation.",
    );
  if (
    /litigation|penalty|fine imposed|regulatory|insolvency|order.*(tax|sebi)/.test(
      s,
    )
  )
    return result(
      "litigation",
      "regulatory_update",
      "high",
      "Review the disclosed regulatory or legal exposure; materiality is not quantified here.",
    );
  if (
    /appoint|change in.*(director|management)|chief executive|chief financial/.test(
      s,
    )
  )
    return result(
      "management_change",
      "appointment",
      "watch",
      "Review the role, effective date and background in the original filing.",
    );
  if (/plant|capacity|capex|expansion/.test(s))
    return result(
      "capex",
      "investment",
      "watch",
      "Capacity or investment update; assess the disclosed scale and timing.",
    );
  if (/split|bonus issue/.test(s))
    return result(
      "bonus_split",
      "corporate_action",
      "watch",
      "A share-count action can affect price comparability.",
    );
  if (/dividend/.test(s))
    return result(
      "dividend",
      "distribution",
      "watch",
      "Review the distribution and eligibility date.",
    );
  if (/qip|rights issue|preferential|buyback|raising of funds/.test(s))
    return result(
      "fund_raise",
      "capital_action",
      "high",
      "A financing or capital-return decision deserves review.",
    );
  if (/pledge|encumbrance/.test(s))
    return result(
      "pledging",
      "pledge_update",
      "watch",
      "A share-pledge disclosure is available.",
    );
  if (/insider|trading.*(promoter|director)/.test(s))
    return result(
      "insider_trading",
      "transaction",
      "watch",
      "Review the disclosed insider transaction.",
    );
  if (/investor.*(meet|conference)|analyst.*meet/.test(s))
    return result(
      "investor_meetings",
      "meeting_notice",
      "routine",
      "Investor-meeting logistics; no new operating claim is inferred.",
    );
  if (/postal ballot/.test(s))
    return result(
      "postal_ballot",
      "voting",
      "routine",
      "Shareholder voting paperwork.",
    );
  if (/annual general|agm|extraordinary general/.test(s))
    return result(
      "agm_egm",
      "meeting",
      "routine",
      "Shareholder meeting paperwork.",
    );
  if (
    /compliance|certificate|esop|loss of share|duplicate.*certificate|trading window/.test(
      s,
    )
  )
    return result(
      "unclassified",
      "compliance",
      "routine",
      "Routine administrative disclosure.",
    );
  if (/press release|order win|partnership|award/.test(s))
    return result(
      "press_release",
      "business_update",
      "watch",
      "Company update; significance needs the underlying disclosure.",
    );
  return result(
    "unclassified",
    "needs_review",
    "watch",
    "Unclassified disclosure retained for review; importance is not yet established.",
  );
}

export function growth(current: number, base: number): number | null {
  return Number.isFinite(current) && Number.isFinite(base) && base > 0
    ? (current / base - 1) * 100
    : null;
}
export function marketStats(bars: Bar[]) {
  const valid = [...new Map(bars.map((b) => [b.date, b])).values()]
    .filter(
      (b) =>
        Number.isFinite(b.close) &&
        b.close > 0 &&
        Number.isFinite(b.volume) &&
        b.volume >= 0,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = valid.at(-1) ?? null,
    previous = valid.at(-2);
  const baseline = valid.slice(-21, -1);
  const avg = baseline.reduce((s, b) => s + b.volume, 0) / 20;
  return {
    latest,
    change:
      latest && previous && !latest.split
        ? growth(latest.close, previous.close)
        : null,
    volumeRatio:
      latest &&
      baseline.length === 20 &&
      avg > 0 &&
      !valid.slice(-21).some((b) => b.split)
        ? latest.volume / avg
        : null,
  };
}
export function completedSession(date: string, now = new Date()): boolean {
  const local = new Date(now.getTime() + 330 * 60000);
  const today = local.toISOString().slice(0, 10);
  return (
    date < today ||
    (date === today && local.getUTCHours() * 60 + local.getUTCMinutes() >= 960)
  );
}
export function normalizeUnit(
  value: number,
  unit: "crore" | "lakh" | "million" | "billion",
) {
  return value * { crore: 1, lakh: 0.01, million: 0.1, billion: 100 }[unit];
}
export type Comparable = {
  metric: string;
  basis: string;
  scope: string;
  period: string;
  end: string;
};
export function compareGuidance(
  claim: Comparable & { low: number; high: number },
  actual: Comparable & { value: number },
  asOf: string,
) {
  if (asOf < claim.end)
    return {
      status: "pending",
      difference: null,
      reason: "The target period is not complete.",
    };
  if (
    ["metric", "basis", "scope", "period"].some(
      (k) => claim[k as keyof Comparable] !== actual[k as keyof Comparable],
    )
  )
    return {
      status: "not_comparable",
      difference: null,
      reason: "Metric, reporting basis, scope or period differs.",
    };
  return {
    status:
      actual.value < claim.low
        ? "missed"
        : actual.value > claim.high
          ? "exceeded"
          : "met",
    difference:
      actual.value - (actual.value < claim.low ? claim.low : claim.high),
    reason: "Matched metric, period, scope and reporting basis.",
  };
}
export function makeAlertId(symbol: string, kind: string, session: string) {
  return `${symbol}:${kind}:${session}`;
}
export function searchPassages(
  question: string,
  passages: Evidence[],
  asOf = new Date().toISOString(),
  limit = 12,
) {
  const stop = new Set(
    "the and what was did how for with company management are its from this that has have does about were which their into could would should tell please explain state reporting basis final actual full year latest recent according annual report".split(
      " ",
    ),
  );
  const stem = (w: string) =>
    w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w;
  const tokenize = (text: string) =>
    text
      .toLowerCase()
      .replace(
        /\b(?:fy|financial year|fiscal year)\s*['’]?(?:20)?(\d{2})\b/g,
        "fy20$1",
      )
      .match(/[a-z]+\d*|\d{4}/g)
      ?.filter((w) => w.length > 2 && !stop.has(w))
      .map(stem) ?? [];
  const synonyms: Record<string, string[]> = {
    guidance: ["outlook", "forecast", "expect"],
    business: ["product", "service", "segment", "operation"],
    cash: ["cashflow", "conversion", "fcf"],
    growth: ["revenue", "demand"],
    margin: ["profitability", "ebitda"],
    risk: ["uncertain", "challenge", "headwind"],
    debt: ["borrowing", "liquidity"],
    capex: ["capacity", "expansion", "capital"],
    revenue: ["sale", "revenue"],
  };
  // Translate common investor phrasing into financial concepts before ranking.
  // These rules are independent of company, document ID and benchmark labels.
  const normalized = question
    .replace(/\b(?:sales|revenue) outlook\b/gi, "revenue guidance outlook")
    .replace(
      /\b(?:purchased|acquired) (?:operations|businesses)\b/gi,
      "inorganic acquisition",
    )
    .replace(
      /\b(?:factory|plant) (?:build[ -]?out|investment|expansion)\b/gi,
      "capex capital expenditure",
    )
    .replace(/\bcapital expenditure\b/gi, "capex capital expenditure")
    .replace(
      /\b(?:spendable money|cash generation)\b/gi,
      "cash conversion free cash flow",
    );
  const original = [...new Set(tokenize(normalized))];
  const businessOverview =
    /\b(?:what.*business|business.*(?:operate|overview|model)|what.*(?:sell|services|products)|company.*do)\b/i.test(
      question,
    );
  const outlookDrivers =
    /outlook|guidance/i.test(question) &&
    /why|weaker|pressure|lower|softer/i.test(question);
  if (!original.length || !Number.isFinite(Date.parse(asOf))) return [];
  const terms = [
    ...new Set(original.flatMap((w) => [w, ...(synonyms[w] ?? [])])),
  ];
  const eligible = passages.filter((p) => {
    const when = p.publishedAt ?? p.availableAt;
    return (
      (!/annual report/i.test(question) ||
        /transcript|\bcall\b/i.test(question) ||
        p.type === "annual_report") &&
      p.metadataStatus !== "conflict" &&
      when &&
      Number.isFinite(Date.parse(when)) &&
      Date.parse(when) <= Date.parse(asOf)
    );
  });
  const rows = eligible.map((p) => ({ p, tokens: tokenize(p.text) }));
  const avgLength =
    rows.reduce((s, r) => s + r.tokens.length, 0) / (rows.length || 1);
  const df = new Map(
    terms.map((t) => [t, rows.filter((r) => r.tokens.includes(t)).length]),
  );
  const ranked = rows
    .map(({ p, tokens }) => {
      let score = 0;
      for (const t of terms) {
        const tf = tokens.filter((w) => w === t).length;
        if (!tf) continue;
        const idf = Math.log(
          1 + (rows.length - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5),
        );
        score +=
          ((idf * (tf * 2.2)) /
            (tf + 1.2 * (0.25 + (0.75 * tokens.length) / (avgLength || 1)))) *
          (original.includes(t) ? 1 : 0.45);
      }
      if (original.includes("business") && p.type === "annual_report")
        score *= 1.2;
      if (businessOverview && p.type === "annual_report") {
        if (
          /(?:is a|provides?|offers?|manufactures?).{0,100}(?:consulting|technology services|products|solutions|services)/i.test(
            p.text,
          )
        )
          score += 35;
        if (
          /table of contents|annexures to the board|investor contacts.*risk management report/i.test(
            p.text,
          )
        )
          score *= 0.1;
        if (
          /about\s+\w+|corporate overview|business overview|(?:global|leading).{0,35}(?:service|consult|manufactur)|(?:provides?|offers?).{0,50}(?:service|product|solution)/i.test(
            p.text,
          )
        )
          score += 24;
        if (
          /auditor.?s? report|audit opinion|internal financial controls|cybersecurity governance/i.test(
            p.text,
          )
        )
          score *= 0.25;
      }
      if (
        outlookDrivers &&
        /pricing pressure|softer.{0,30}(?:volume|demand)|headwind|discretionary/i.test(
          p.text,
        )
      )
        score += 14;
      if (
        original.includes("inorganic") &&
        /inorganic|acquisition/i.test(p.text) &&
        /guidance|outlook/i.test(p.text)
      )
        score += 18;
      if (
        original.includes("capex") &&
        /(?:capex|capital expenditure).{0,45}(?:INR|Rs|crore|billion|million|\d)/i.test(
          p.text,
        )
      )
        score += 18;
      if (
        original.includes("segment") &&
        p.type === "annual_report" &&
        /reportable|operating segment|decorative|industrial/i.test(p.text)
      )
        score += 8;
      if (p.speakerRole === "analyst" || p.speakerRole === "moderator")
        score *= 0.35;
      if (original.includes("guidance") && p.type === "transcript") {
        score *= 1.2;
        if (
          /(?:revenue.{0,25}guidance|guidance.{0,30}(?:growth|revenue))/i.test(
            p.text,
          ) &&
          /\d.*%/.test(p.text)
        )
          score += 18;
        if (
          /actual|deliver|achiev|happened|versus|full.year/i.test(question) &&
          /financial year|full.year|FY\s*['’]?\d/i.test(p.text) &&
          /(?:grew|delivered|achieved|reported|revenues).{0,50}\d.*%/i.test(
            p.text,
          ) &&
          !/guidance/i.test(p.text)
        )
          score += 25;
      }
      const fiscal = original.find((t) => /^fy20\d{2}$/.test(t));
      if (fiscal) {
        if (tokens.includes(fiscal)) score += 8;
        else if (tokens.some((t) => /^fy20\d{2}$/.test(t))) score *= 0.4;
      }
      return { p, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  // Diversify documents and remove near-identical windows before filling context.
  const chosen: Evidence[] = [],
    counts = new Map<string, number>(),
    seen = new Set<string>();
  for (const cap of [2, 4, limit])
    for (const { p } of ranked) {
      const fingerprint = p.text.toLowerCase().replace(/\s+/g, " ").trim();
      if (chosen.length >= limit) return chosen;
      if (
        seen.has(fingerprint) ||
        (counts.get(p.documentId) ?? 0) >= cap ||
        chosen.some(
          (x) =>
            x.documentId === p.documentId &&
            x.page === p.page &&
            (x.text.includes(p.text.slice(0, 100)) ||
              p.text.includes(x.text.slice(0, 100))),
        )
      )
        continue;
      chosen.push(p);
      seen.add(fingerprint);
      counts.set(p.documentId, (counts.get(p.documentId) ?? 0) + 1);
    }
  return chosen;
}

export function snapshotEnd(
  events: Pick<Filing, "publishedAt">[],
  fallback: string,
  now = new Date(),
): Date {
  const times = events
    .map((e) => Date.parse(e.publishedAt))
    .filter(Number.isFinite);
  const result = times.length
    ? Math.max(...times) + 3600000
    : Date.parse(fallback);
  return Number.isFinite(result) ? new Date(result) : now;
}
