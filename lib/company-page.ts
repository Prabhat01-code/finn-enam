import {
  documents,
  passages,
  financialContext,
  resolveCompany,
  newJob,
  activeJobs,
  type Job,
} from "./services";
import {
  eligibleEvidence,
  selectResults,
  guidanceAnswer,
  planQuestion,
} from "./question-plan";
import { searchPassages, type Evidence } from "./domain";
import { get, put, list } from "./store";
import { sha256 } from "./collectors";
import { workerStatus } from "./background-jobs";
import { quarterChanges, type QuarterChanges } from "./quarter-changes";

export async function buildCompanyPage(symbol: string, requestedAsOf?: string) {
  const asOf = requestedAsOf ?? new Date().toISOString();
  const company = resolveCompany(symbol);
  const docs = await documents(company.symbol);
  const all = (await passages(company.symbol)).filter((e) =>
    eligibleEvidence(e, asOf),
  );
  const facts = await financialContext(company.symbol, docs);
  const evidenceVersion = await sha256(
    JSON.stringify({
      version: "company-page-v3",
      docs: docs.map((d) => [
        d.id,
        d.hash,
        d.revision,
        d.metadata,
        d.status,
        d.publishedAt,
        d.fetchedAt,
      ]),
      facts,
      eligible: all.map((e) => e.documentId),
      asOf: requestedAsOf ?? asOf.slice(0, 10),
    }),
  );
  const id = `${company.symbol}:${evidenceVersion}`;
  const cached = await get<CompanyPage>("company_page", id);
  if (cached) return { ...cached, cached: true };
  const indexed = docs.filter(
    (d) => d.status === "extracted" && all.some((e) => e.documentId === d.id),
  );
  const annual = indexed.filter((d) => d.type === "annual_report").length;
  const calls = indexed.filter((d) => d.type === "transcript").length;
  const results = selectResults(facts.tables, asOf);
  const guidance = guidanceAnswer(
    planQuestion(company.symbol, "Did management meet guidance?", asOf),
    facts.guidance,
  );
  const page = {
    company,
    evidenceVersion,
    asOf,
    generatedAt: new Date().toISOString(),
    cached: false,
    status:
      annual && calls && results && guidance.status !== "insufficient_evidence"
        ? "ready"
        : all.length
          ? "partial"
          : "empty",
    business: searchPassages(
      "What business does the company operate? Products services operations segments",
      all.filter((e) => e.type === "annual_report"),
      asOf,
      2,
    ),
    results,
    quarterChanges: quarterChanges(company.symbol, facts.tables, docs, asOf),
    guidance,
    coverage: {
      annualReports: annual,
      transcripts: calls,
      passages: all.length,
      failed: docs.filter((d) => d.status !== "extracted").length,
    },
    gaps: [
      !annual ? "No date-eligible annual report is indexed." : "",
      !calls ? "No date-eligible earnings transcript is indexed." : "",
      !results
        ? "Comparable quarterly financial facts are not yet verified."
        : "",
      "The business excerpts are source text, not a generated company profile.",
    ].filter(Boolean),
  };
  await put("company_page", id, page, company.symbol);
  return page;
}
export type CompanyPage = {
  company: ReturnType<typeof resolveCompany>;
  evidenceVersion: string;
  asOf: string;
  generatedAt: string;
  cached: boolean;
  status: string;
  business: Evidence[];
  results: ReturnType<typeof selectResults>;
  guidance: ReturnType<typeof guidanceAnswer>;
  quarterChanges: QuarterChanges;
  coverage: {
    annualReports: number;
    transcripts: number;
    passages: number;
    failed: number;
  };
  gaps: string[];
};
export async function getOrBuildCompanyPage(
  user: string,
  symbol: string,
  asOf?: string,
  force = false,
) {
  const page = await buildCompanyPage(symbol, asOf);
  const jobs = await list<Job>("job", user);
  let job = (await activeJobs(user)).find(
    (j) => j.type === "research" && j.symbol === page.company.symbol,
  );
  const recent = jobs.some(
    (j) =>
      j.type === "research" &&
      j.symbol === page.company.symbol &&
      Date.now() - Date.parse(j.createdAt) < 86400000,
  );
  const docs = await documents(page.company.symbol);
  const fresh = docs.some(
    (d) =>
      d.status === "extracted" &&
      Date.now() - Date.parse(d.fetchedAt) < 86400000,
  );
  // Historical replay never launches present-day collection implicitly.
  if (
    !job &&
    !asOf &&
    (force ||
      (!recent &&
        (!fresh ||
          !page.coverage.annualReports ||
          !page.coverage.transcripts ||
          !page.coverage.passages)))
  )
    job = await newJob("research", user, page.company.symbol);
  return {
    page,
    job: job ?? null,
    worker: await workerStatus(),
    status: job ? "queued" : page.status === "ready" ? "succeeded" : "partial",
  };
}
