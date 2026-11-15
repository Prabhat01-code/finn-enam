import { currentDocuments } from "./source-records";
import type { FinancialResults } from "./financials";
import { factCatalog } from "./fact-catalog";
import { eligibleEvidence, selectResults, planQuestion } from "./question-plan";
import {
  retrieveEvidence,
  indexEmbeddingBatch,
  embeddingConfig,
} from "./retrieval-service";
import { acquireLease, releaseLease, retryDelay } from "./job-leases";
import snapshotData from "../data/snapshot.json";
import companiesData from "../data/companies.json";
import {
  DEFAULT_RULES,
  PORTFOLIO,
  classify,
  makeAlertId,
  type Company,
  type DocumentRecord,
  type Evidence,
  type Filing,
  type MarketData,
  type Rules,
} from "./domain";
import {
  discover,
  fetchFilings,
  fetchMarket,
  parseDocument,
  sourceKey,
  type DiscoveredDocument,
} from "./collectors";
import { db, get, insertOnce, list, put, remove } from "./store";
export type SourceRun = {
  symbol: string;
  source: string;
  status: string;
  finishedAt: string;
  error?: string;
  note?: string;
};
export type Alert = {
  id: string;
  symbol: string;
  kind: string;
  detail: string;
  date: string;
  source: string;
  user: string;
  createdAt: string;
};
export type Snapshot = {
  asOf: string;
  companies: Company[];
  markets: MarketData[];
  events: Filing[];
  documents: DocumentRecord[];
  passages: Evidence[];
  runs: SourceRun[];
};
export const snapshot = snapshotData as Snapshot;
const classified = (e: Filing): Filing => ({
  ...e,
  ...classify(e.title, e.description),
});
export const companies = companiesData as Company[];
export type Job = {
  id: string;
  user: string;
  type: string;
  symbol?: string;
  status: string;
  stage: string;
  progress: number;
  total: number;
  createdAt: string;
  updatedAt: string;
  error?: string;
  warnings: string[];
  done?: string[];
  attempts?: number;
  nextAttemptAt?: number;
  resultUrl?: string;
  embeddingStage?: boolean;
  queue?: (string | (DiscoveredDocument & { companyHost?: string }))[];
};
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Source failed";
const merge = <T>(old: T[], fresh: T[], key: (r: T) => string) => [
  ...new Map([...old, ...fresh].map((r) => [key(r), r])).values(),
];
export function resolveCompany(symbol: string) {
  const company = companies.find(
    (c) => c.symbol === symbol.toUpperCase().trim(),
  );
  if (!company)
    throw new Error(
      "Unknown NSE symbol. Choose a company from the security list.",
    );
  return { ...company, sector: PORTFOLIO[company.symbol] ?? "Other" };
}
export async function portfolio(user: string) {
  const symbols =
    (await get<string[]>("portfolio", user)) ?? Object.keys(PORTFOLIO);
  return symbols.map(resolveCompany);
}
export async function setPortfolio(user: string, symbols: string[]) {
  const validated = [...new Set(symbols)].slice(0, 25);
  validated.forEach(resolveCompany);
  await put("portfolio", user, validated);
  return validated;
}
export async function settings(user: string) {
  return (await get<Rules>("settings", user)) ?? DEFAULT_RULES;
}
export async function events() {
  return merge<Filing>(
    snapshot.events,
    await list<Filing>("event"),
    (r) => r.id,
  ).map(classified);
}
export async function markets() {
  return merge<MarketData>(
    snapshot.markets,
    await list<MarketData>("market"),
    (r) => r.symbol,
  );
}
export async function documents(symbol: string) {
  return currentDocuments([
    ...snapshot.documents.filter((d) => d.symbol === symbol),
    ...(await list<DocumentRecord>("document", symbol)),
  ]);
}
export async function passages(symbol: string) {
  const docs = await documents(symbol),
    active = new Map(
      docs.filter((d) => d.status === "extracted").map((d) => [d.id, d]),
    );
  return merge<Evidence>(
    snapshot.passages as Evidence[],
    await list<Evidence>("passage", symbol),
    (p) => `${p.documentId}:${p.page}:${p.text.slice(0, 70)}`,
  ).filter((p) => {
    const d = active.get(p.documentId);
    return (
      !!d &&
      d.metadata?.status !== "conflict" &&
      (!d.revision || d.revision === p.revision)
    );
  });
}
export async function readItems(user: string) {
  const [legacy, rows] = await Promise.all([
    get<string[]>("read", user),
    list<{ id: string; read: boolean }>("read_item", user),
  ]);
  const ids = new Set(legacy ?? []);
  for (const row of rows) {
    if (row.read) ids.add(row.id);
    else ids.delete(row.id);
  }
  return [...ids];
}
export async function markRead(user: string, id: string, read: boolean) {
  await put("read_item", `${user}:${id}`, { id, read }, user);
}
export async function activeJobs(user: string) {
  return (await list<Job>("job", user))
    .filter((j) => j.user === user && j.status === "running")
    .slice(0, 4);
}
export async function filingEvidence(id: string) {
  const filing = (await events()).find((e) => e.id === id);
  if (!filing) throw new Error("Filing not found");
  const doc = (await documents(filing.symbol)).find(
    (d) =>
      sourceKey(d.url) === sourceKey(filing.url) && d.status === "extracted",
  );
  return doc
    ? (await passages(filing.symbol))
        .filter((p) => p.documentId === doc.id)
        .slice(0, 8)
    : [];
}
export async function indexFiling(user: string, id: string) {
  const filing = (await events()).find((e) => e.id === id);
  if (!filing) throw new Error("Filing not found");
  if (!(await portfolio(user)).some((c) => c.symbol === filing.symbol))
    throw new Error("Choose a filing from your portfolio");
  const active = (await activeJobs(user)).find(
    (j) => j.type === "filing" && j.symbol === filing.symbol,
  );
  if (active) return active;
  const job: Job = {
    id: crypto.randomUUID(),
    user,
    type: "filing",
    symbol: filing.symbol,
    status: "running",
    stage: "Reading original attachment",
    progress: 0,
    total: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    warnings: [],
    queue: [
      {
        url: filing.url,
        title: filing.description,
        type: filing.category === "results" ? "results" : "filing",
        period: filing.publishedAt.slice(0, 10),
        publishedAt: filing.publishedAt,
      },
    ],
  };
  await put("job", job.id, job, user);
  return job;
}
export async function research(
  symbol: string,
  question: string,
  asOf?: string,
  structuredOnly = false,
) {
  const company = resolveCompany(symbol),
    docs = await documents(company.symbol);
  const all = await passages(company.symbol);
  const at = asOf ?? new Date().toISOString();
  const plan = planQuestion(company.symbol, question, at);
  const { evidence, retrieval } = structuredOnly
    ? {
        evidence: [],
        retrieval: {
          mode: "structured" as const,
          reason:
            "Verified fact lookup and deterministic calculation; no embedding request.",
          eligible: 0,
          indexed: 0,
          version: plan.version,
        },
      }
    : await retrieveEvidence(
        company.symbol,
        docs,
        all,
        question,
        at,
        plan.period,
      );
  const { tables } = await financialContext(company.symbol, docs);
  const results = selectResults(tables, at);
  const eligibleDocs = docs.filter((d) =>
    eligibleEvidence(
      {
        documentId: d.id,
        title: d.title,
        url: d.url,
        page: 1,
        text: "",
        type: d.type,
        publishedAt: d.publishedAt,
        availableAt: d.fetchedAt,
        metadataStatus: d.metadata?.status,
      },
      at,
    ),
  );
  return {
    results,
    retrieval,
    company,
    documents: docs,
    evidence,
    question,
    asOf: at,
    engine: "Primary-source evidence search",
    generated: false,
    message: evidence.length
      ? "Relevant passages from company-authored documents. These excerpts are retrieval results; they do not independently establish a conclusion."
      : "No matching, date-eligible evidence is available. Try another question or discover more documents.",
    coverage: {
      annualReports: eligibleDocs.filter(
        (d) => d.type === "annual_report" && d.status === "extracted",
      ).length,
      transcripts: eligibleDocs.filter(
        (d) => d.type === "transcript" && d.status === "extracted",
      ).length,
      failed: docs.filter((d) => d.status !== "extracted").length,
    },
  };
}
export async function financialContext(
  symbol: string,
  docs?: DocumentRecord[],
) {
  return factCatalog(
    symbol,
    docs ?? (await documents(symbol)),
    await list<FinancialResults>("financial_results", symbol),
  );
}
export async function newJob(
  type: "refresh" | "research",
  user: string,
  symbol?: string,
): Promise<Job> {
  if (symbol) symbol = resolveCompany(symbol).symbol;
  const active = await list<Job>("job", user);
  const running = active.find(
    (j) => j.type === type && j.symbol === symbol && j.status === "running",
  );
  if (running) return running;
  const recent = active.filter(
    (j) => Date.now() - Date.parse(j.createdAt) < 60000,
  );
  if (recent.length >= 4)
    throw new Error("Please wait a minute before starting more source jobs.");
  if (symbol) resolveCompany(symbol);
  const job: Job = {
    id: crypto.randomUUID(),
    user,
    type,
    symbol,
    status: "running",
    stage:
      type === "research" ? "Discovering documents" : "Refreshing portfolio",
    progress: 0,
    total: type === "research" ? 1 : (await portfolio(user)).length,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    warnings: [],
    done: [],
    queue:
      type === "refresh"
        ? (await portfolio(user)).map((c) => c.symbol)
        : undefined,
  };
  const inserted = await db()
    .prepare(
      "INSERT INTO records(kind,id,symbol,published_at,payload,updated_at) SELECT 'job',?,?,NULL,?,? WHERE NOT EXISTS (SELECT 1 FROM records WHERE kind='job' AND symbol=? AND json_extract(payload,'$.type')=? AND COALESCE(json_extract(payload,'$.symbol'),'')=? AND json_extract(payload,'$.status')='running') AND (SELECT COUNT(*) FROM records WHERE kind='job' AND json_extract(payload,'$.status')='running') < 100 AND (SELECT COUNT(*) FROM records WHERE kind='job' AND symbol=? AND updated_at>?) < 24",
    )
    .bind(
      job.id,
      user,
      JSON.stringify(job),
      job.updatedAt,
      user,
      type,
      symbol ?? "",
      user,
      new Date(Date.now() - 86400000).toISOString(),
    )
    .run();
  if (inserted.meta.changes) return job;
  const concurrent = (await activeJobs(user)).find(
    (j) => j.type === type && j.symbol === symbol,
  );
  if (concurrent) return concurrent;
  throw new Error(
    "The source-job capacity has been reached. Existing evidence remains available.",
  );
}
export async function persistDocument(
  symbol: string,
  parsed: {
    document: DocumentRecord;
    passages: Evidence[];
    results?: FinancialResults | null;
  },
) {
  const revision = crypto.randomUUID();
  // Stage a complete revision, then publish its pointer. Readers never combine revisions.
  for (let at = 0; at < parsed.passages.length; at += 40) {
    const part = parsed.passages.slice(at, at + 40);
    await db().batch(
      part.map((p, i) =>
        db()
          .prepare(
            "INSERT OR REPLACE INTO records(kind,id,symbol,published_at,payload,updated_at) VALUES(?,?,?,?,?,?)",
          )
          .bind(
            "passage",
            `${p.documentId}:${revision}:${at + i}`,
            symbol,
            p.publishedAt,
            JSON.stringify({
              ...p,
              revision,
              availableAt: parsed.document.fetchedAt,
            }),
            new Date().toISOString(),
          ),
      ),
    );
  }
  if (parsed.results)
    await put(
      "financial_results",
      parsed.document.id,
      parsed.results,
      symbol,
      parsed.document.publishedAt,
    );
  else await remove("financial_results", parsed.document.id);
  await put(
    "document",
    parsed.document.id,
    { ...parsed.document, revision },
    symbol,
    parsed.document.publishedAt,
  );
  await db()
    .prepare(
      "DELETE FROM records WHERE kind='passage' AND symbol=? AND json_extract(payload,'$.documentId')=? AND COALESCE(json_extract(payload,'$.revision'),'')!=?",
    )
    .bind(symbol, parsed.document.id, revision)
    .run();
}
async function evaluateMarket(user: string, market: MarketData) {
  const rules = await settings(user),
    date = market.latest?.date;
  if (!date) return;
  const candidates = [
    {
      kind: "price",
      trigger:
        market.change !== null &&
        Math.abs(market.change) > rules.priceThreshold,
      value: market.change,
      threshold: rules.priceThreshold,
      detail: `Daily close move exceeds ±${rules.priceThreshold}%`,
    },
    {
      kind: "volume",
      trigger:
        market.volumeRatio !== null &&
        market.volumeRatio > rules.volumeMultiplier,
      value: market.volumeRatio,
      threshold: rules.volumeMultiplier,
      detail: `Volume exceeds ${rules.volumeMultiplier}× the prior 20-session mean`,
    },
  ];
  for (const a of candidates)
    if (a.trigger)
      await insertOnce(
        "alert",
        `${user}:${makeAlertId(market.symbol, a.kind, date)}`,
        {
          ...a,
          id: makeAlertId(market.symbol, a.kind, date),
          symbol: market.symbol,
          date,
          source: market.url,
          createdAt: new Date().toISOString(),
          user,
          mode: "live",
        },
        market.symbol,
        date,
      );
}
// Each call advances one leased, persisted stage. A server worker drives this;
// browsers only read progress. Expired leases allow restart recovery.
export async function stepJob(id: string, user: string): Promise<Job> {
  let job = await get<Job>("job", id);
  if (!job || job.user !== user) throw new Error("Job not found");
  if (job.status !== "running") return job;
  if ((job.nextAttemptAt ?? 0) > Date.now()) return job;
  const lockId = `job:${id}`;
  const lease = await acquireLease(lockId);
  if (!lease) return job;
  try {
    job = (await get<Job>("job", id))!;
    if (job.status !== "running") return job;
    if (job.type === "refresh") {
      const symbol = job.queue?.[job.progress];
      if (typeof symbol !== "string") {
        job.status = "complete";
        job.stage = "Refresh complete";
      } else {
        job.stage = `Refreshing ${symbol}`;
        for (const source of ["prices", "filings"])
          try {
            if (source === "prices") {
              const market = await fetchMarket(symbol);
              await put("market", symbol, market, symbol, market.latest?.date);
              await evaluateMarket(user, market);
            } else {
              const to = new Date(),
                from = new Date(to.getTime() - 7 * 86400000);
              const rows = await fetchFilings(symbol, from, to);
              const rules = await settings(user);
              for (const row of rows) {
                await put("event", row.id, row, symbol, row.publishedAt);
                if (
                  row.priority !== "routine" &&
                  rules.categories.includes(row.category)
                )
                  await insertOnce(
                    "alert",
                    `${user}:${row.id}`,
                    {
                      id: row.id,
                      symbol,
                      kind: "announcement",
                      detail: row.description,
                      date: row.publishedAt,
                      source: row.url,
                      user,
                      createdAt: new Date().toISOString(),
                      mode: "live",
                    },
                    symbol,
                    row.publishedAt,
                  );
              }
            }
            await put(
              "run",
              `${symbol}:${source}`,
              {
                symbol,
                source,
                status: "success",
                finishedAt: new Date().toISOString(),
                windowDays: source === "filings" ? 7 : 90,
                note:
                  source === "filings"
                    ? "NSE symbol response; complete exchange pagination is not guaranteed."
                    : "Completed daily sessions",
              },
              symbol,
            );
          } catch (e: unknown) {
            job.warnings.push(`${symbol} ${source}: ${message(e)}`);
            await put(
              "run",
              `${symbol}:${source}`,
              {
                symbol,
                source,
                status: "failed",
                error: message(e),
                finishedAt: new Date().toISOString(),
              },
              symbol,
            );
          }
        job.progress++;
        if (job.progress >= job.total) {
          job.status = job.warnings.length ? "partial" : "complete";
          job.stage = job.warnings.length
            ? "Refresh finished with gaps"
            : "Refresh complete";
        }
      }
    } else {
      const company = resolveCompany(job.symbol!);
      if (job.embeddingStage) {
        const indexed = await indexEmbeddingBatch(
          company.symbol,
          await documents(company.symbol),
          await passages(company.symbol),
        );
        job.stage = `Semantic index: ${indexed.indexed} passages ready`;
        if (indexed.warning) job.warnings.push(indexed.warning);
        if (indexed.done) {
          job.status = job.warnings.length ? "partial" : "complete";
          job.resultUrl = `/api/company-page?symbol=${encodeURIComponent(company.symbol)}`;
        }
      } else if (!job.queue) {
        const found = await discover(company);
        job.queue = found.documents.map((d) => ({
          ...d,
          companyHost: found.companyHost,
        }));
        job.total = job.queue.length;
        // Results share the same source pipeline. Limit discovery to recent,
        // substantive results attachments, never presentations as actuals.
        try {
          const filings = await fetchFilings(
            company.symbol,
            new Date(Date.now() - 120 * 86400000),
            new Date(),
          );
          const results = filings
            .filter(
              (f) =>
                f.category === "results" &&
                /financial results/i.test(f.description) &&
                !/meeting|intimation|presentation/i.test(f.description),
            )
            .slice(0, 2);
          job.queue.push(
            ...results.map((f) => ({
              url: f.url,
              title: f.description,
              type: "results",
              period: f.publishedAt.slice(0, 10),
              publishedAt: f.publishedAt,
            })),
          );
          job.total = job.queue.length;
        } catch {
          job.warnings.push(
            "Recent results discovery is unavailable; document research can still finish.",
          );
        }
        job.stage = "Document links discovered";
        job.attempts = 0;
        job.nextAttemptAt = undefined;
        if (!job.total) {
          job.status = "partial";
          job.warnings.push(
            "No annual reports or raw transcripts found on the discovery page.",
          );
        }
      } else if (job.progress < job.queue.length) {
        const input = job.queue[job.progress];
        if (typeof input === "string") throw new Error("Invalid document job");
        job.stage = `Downloading and extracting ${input.title}`;
        try {
          const cached = (await documents(company.symbol)).find(
            (d) =>
              (sourceKey(d.url) === sourceKey(input.url) ||
                d.originalUrl === input.url) &&
              d.status === "extracted" &&
              d.parser === "unpdf-1.4.0/page-text-v5" &&
              Date.now() - Date.parse(d.fetchedAt) < 86400000,
          );
          if (!cached) {
            const parsed = await parseDocument(
              company,
              input,
              input.companyHost,
            );
            await persistDocument(company.symbol, parsed);
            if (parsed.document.status !== "extracted")
              job.warnings.push(`${input.title}: ${parsed.document.error}`);
          }
        } catch (e: unknown) {
          job.attempts = (job.attempts ?? 0) + 1;
          if (job.attempts < 3) {
            job.nextAttemptAt = Date.now() + retryDelay(job.attempts);
            job.stage = "Source interrupted; retry scheduled";
            return job;
          }
          job.warnings.push(`${input.title}: ${message(e)}`);
          await put(
            "document",
            `failed:${company.symbol}:${input.type}:${input.period}`,
            {
              id: `failed:${company.symbol}:${input.type}:${input.period}`,
              symbol: company.symbol,
              ...input,
              status: "failed",
              error: message(e),
              fetchedAt: new Date().toISOString(),
              pages: 0,
            },
            company.symbol,
          );
        }
        job.progress++;
        job.attempts = 0;
        job.nextAttemptAt = undefined;
        if (job.progress >= job.total) {
          job.embeddingStage = !!embeddingConfig();
          job.status = job.embeddingStage
            ? "running"
            : job.warnings.length
              ? "partial"
              : "complete";
          job.stage = "Evidence indexed";
          job.resultUrl = `/api/company-page?symbol=${encodeURIComponent(company.symbol)}`;
        }
      }
    }
  } catch (e: unknown) {
    job.attempts = (job.attempts ?? 0) + 1;
    job.status = job.attempts < 3 ? "running" : "failed";
    job.error = message(e);
    job.nextAttemptAt =
      job.status === "running"
        ? Date.now() + retryDelay(job.attempts)
        : undefined;
    job.stage =
      job.status === "running"
        ? "Source interrupted; retry scheduled"
        : "Source stage failed";
  } finally {
    job.updatedAt = new Date().toISOString();
    await db()
      .prepare(
        "UPDATE records SET payload=?,updated_at=? WHERE kind='job' AND id=? AND EXISTS (SELECT 1 FROM records WHERE kind='lock' AND id=? AND json_extract(payload,'$.token')=? AND json_extract(payload,'$.until')>=?)",
      )
      .bind(JSON.stringify(job), job.updatedAt, id, lockId, lease, Date.now())
      .run();
    await releaseLease(lockId, lease);
  }
  return job;
}
export async function dashboard(user: string) {
  const [members, rules, allEvents, allMarkets, runRows, alerts, read] =
    await Promise.all([
      portfolio(user),
      settings(user),
      events(),
      markets(),
      list<SourceRun>("run"),
      list<Alert>("alert"),
      readItems(user),
    ]);
  const symbols = new Set(members.map((c) => c.symbol));
  const runs = merge<SourceRun>(
    snapshot.runs,
    runRows,
    (r) => `${r.symbol}:${r.source}`,
  );
  return {
    portfolio: members,
    rules,
    events: allEvents.filter((e) => symbols.has(e.symbol)),
    snapshotEvents: (snapshot.events as Filing[])
      .filter((e) => symbols.has(e.symbol))
      .map(classified),
    markets: allMarkets.filter((m) => symbols.has(m.symbol)),
    snapshotMarkets: snapshot.markets.filter((m: MarketData) =>
      symbols.has(m.symbol),
    ),
    runs: runs.filter((r) => symbols.has(r.symbol)),
    alerts: alerts.filter((a) => a.user === user && symbols.has(a.symbol)),
    read: read ?? [],
    snapshotAt: snapshot.asOf,
    now: new Date().toISOString(),
    engine: "Primary-source research",
    jobs: await activeJobs(user),
  };
}
