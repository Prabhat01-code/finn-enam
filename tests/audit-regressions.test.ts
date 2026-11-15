import { currentDocuments } from "../lib/source-records";
import test from "node:test";
import assert from "node:assert/strict";
import { validateAnswer } from "../lib/model";
import { reviewSupport } from "../lib/support-review";
import { reconcileMetadata } from "../lib/provenance";
import {
  snapshotEnd,
  classify,
  type DocumentRecord,
  type Evidence,
} from "../lib/domain";
import { guidanceOutcome } from "../lib/financials";
import { extractResults } from "../lib/results-extraction";
import { canonicalSource, fetchWithBackoff } from "../lib/source-fetch";
import reviewed from "../data/reviewed-analyses.json";
import snapshot from "../data/snapshot.json";
const evidence = (text: string): Evidence => ({
  documentId: "synthetic",
  title: "Synthetic",
  url: "https://example.com/document.pdf",
  page: 1,
  text,
  publishedAt: "2025-01-01",
  type: "transcript",
});
test("audit: wrong metric, direction, forecast and speaker are withheld", () => {
  const cases = [
    [
      "Revenue was INR 100 crore and PAT was INR 20 crore.",
      "PAT was INR 100 crore and revenue was INR 20 crore.",
    ],
    [
      "Revenue declined 5% in constant currency during FY25.",
      "Revenue grew 5% in constant currency during FY25.",
    ],
    [
      "Management expects revenue growth of 5% in FY25.",
      "Management delivered revenue growth of 5% in FY25.",
    ],
    [
      "Analyst: Is a 5% margin possible? Management: We give no margin guidance.",
      "Management guided for a 5% margin.",
    ],
  ];
  for (const [quote, text] of cases) {
    const result = validateAnswer(
      {
        status: "answered",
        claims: [
          { text, kind: "reported", citations: [{ sourceId: "S1", quote }] },
        ],
        gaps: [],
      },
      [evidence(quote)],
    );
    assert.equal(result.claims.length, 0, text);
  }
});
test("empty and unfamiliar portfolios have a valid snapshot end", () => {
  assert.equal(
    snapshotEnd([], "2026-11-15T09:00:00Z").toISOString(),
    "2026-11-15T09:00:00.000Z",
  );
  assert.equal(
    snapshotEnd([], "invalid", new Date("2026-01-01")).toISOString(),
    "2026-01-01T00:00:00.000Z",
  );
});
test("document metadata conflicts cannot silently promote a discovery year", () => {
  const m = reconcileMetadata(
    [
      "July 14, 2025 Transcript of the earnings conference call held on July 10, 2025 for the quarter ended June 30, 2025.",
    ],
    "transcript",
    "Jul 2026",
  );
  assert.equal(m.status, "conflict");
  assert.equal(m.callDate, "2025-07-10");
  assert.equal(m.periodEnd, "2025-06-30");
  const corrected = snapshot.documents.find((d) => d.url.includes("9cee0fdb"));
  assert.ok(corrected);
  assert.match(corrected.title, /2025/);
  assert.equal(corrected.publishedAt, null);
  const investor = snapshot.documents.find(
    (d) => d.id === "doc-e1d969bc5afd09fa6955",
  );
  assert.notEqual(investor?.type, "transcript");
});
test("capital-action notices and auditor appointments retain their subjects", () => {
  const r = classify(
    "Board Meeting Intimation for Consideration of Buyback of Equity Shares",
  );
  assert.equal(r.category, "fund_raise");
  assert.equal(r.subtype, "meeting_notice");
  assert.notEqual(r.priority, "routine");
  assert.equal(
    classify(
      "Appointment of Statutory Auditors Pursuant to Mandatory Auditor Rotation",
    ).subtype,
    "auditor_appointment",
  );
});
test("reviewed capex is met; the incomplete annual growth period remains pending", () => {
  const p = reviewed.companies.find((c) => c.symbol === "POLYCAB")!,
    h = reviewed.companies.find((c) => c.symbol === "HCLTECH")!;
  assert.equal(guidanceOutcome(p.guidance, "2026-11-15"), "met");
  assert.equal(guidanceOutcome(p.guidance, "2026-02-01"), "pending");
  assert.equal(guidanceOutcome(h.guidance, "2026-11-15"), "pending");
  assert.equal(
    h.results.metrics.find((m) => m.name === "EBITDA")?.current,
    null,
  );
});
test("generic tables require comparable quarter columns, explicit unit and scope", () => {
  const doc = {
    id: "synthetic",
    type: "results",
    url: "https://example.com",
    title: "Synthetic results",
    publishedAt: "2026-10-10",
    fetchedAt: "2026-11-15",
  } as DocumentRecord;
  const table =
    "Consolidated results in crore\nThree months ended September 30, 2026 June 30, 2026 September 30, 2025\nRevenue from operations 120 110 100\nProfit before tax 30 25 20\nProfit after tax 24 20 16";
  assert.equal(extractResults(doc, [table])?.metrics[0].current, 120);
  assert.equal(extractResults(doc, [table.replace("in crore", "")]), null);
  assert.equal(
    extractResults(doc, [table.replace("June 30, 2026", "March 31, 2026")]),
    null,
  );
});
test("source aliases are canonical and transient failures retry within bounds", async () => {
  assert.match(
    canonicalSource(
      "https://www.bseindia.com/stockinfo/AnnPdfOpen.aspx?Pname=9cee0fdb-07a3-4dc6-af7a-40dce51e1348.pdf",
    ),
    /AttachHis/,
  );
  let calls = 0;
  const response = await fetchWithBackoff("https://example.com", async () => {
    calls++;
    return new Response("", { status: calls === 1 ? 503 : 200 });
  });
  assert.equal(calls, 2);
  assert.equal(response.status, 200);
});
test("support review withholds incorrect attribution and rejects incomplete review", async () => {
  const e = evidence("An analyst asked whether revenue was 100 crore.");
  const answer = {
    status: "answered" as const,
    claims: [
      {
        text: "Management reported revenue of 100 crore.",
        kind: "reported" as const,
        citations: [{ sourceId: "S1", quote: e.text, evidence: e }],
      },
    ],
    gaps: [],
    model: "test",
    provider: "test",
    generatedAt: new Date().toISOString(),
    cached: false,
    validation: {
      acceptedClaims: 1,
      rejectedClaims: 0,
      rejectionReasons: [],
      quoteChecks: true,
      note: "",
    },
    usage: { requests: 1, inputTokens: 10, outputTokens: 10, durationMs: 1 },
  };
  const response = await reviewSupport(answer, "synthetic", async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              reviews: [{ index: 0, supported: false, reason: "speaker" }],
            }),
          },
        },
      ],
    }),
  );
  assert.equal(response.claims.length, 0);
  assert.equal(response.usage.requests, 2);
  await assert.rejects(() =>
    reviewSupport(answer, "synthetic", async () =>
      Response.json({ choices: [{ message: { content: '{"reviews":[]}' } }] }),
    ),
  );
});

test("fiscal years and attribution dates are not bound to a metric value", () => {
  const quote =
    "In financial year 2025, revenue grew 4.2% in constant currency.";
  const result = validateAnswer(
    {
      status: "answered",
      claims: [
        {
          text: "Revenue grew 4.2% in FY25, reported in April 2025.",
          kind: "reported",
          citations: [{ sourceId: "S1", quote }],
        },
      ],
      gaps: [],
    },
    [evidence(quote)],
  );
  assert.equal(result.claims.length, 1);
});

test("an obsolete failed source cannot replace its successful recovery", () => {
  const base = {
    id: "recovered",
    url: "https://www.bseindia.com/xml-data/corpfiling/AttachHis/9cee0fdb-07a3-4dc6-af7a-40dce51e1348.pdf",
    status: "extracted",
    fetchedAt: "2026-11-15T12:00:00Z",
  } as DocumentRecord;
  const failed = {
    ...base,
    id: "failure",
    status: "failed",
    fetchedAt: "2026-11-15T09:00:00Z",
  };
  assert.equal(currentDocuments([base, failed])[0].id, "recovered");
  assert.equal(
    currentDocuments([
      base,
      { ...failed, fetchedAt: "2026-11-16T09:00:00Z" },
    ])[0].id,
    "recovered",
  );
  const replacement = { ...base, id: "new", fetchedAt: "2026-11-17T09:00:00Z" };
  assert.equal(currentDocuments([replacement, base, failed])[0].id, "new");
});
