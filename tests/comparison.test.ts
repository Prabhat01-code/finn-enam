import test from "node:test";
import assert from "node:assert/strict";
import { selectCallContext, validateComparison } from "../lib/call-comparison";
import { extractPassages } from "../lib/passages";
import { assessQuality } from "../lib/evaluation";
import type { DocumentRecord, Evidence } from "../lib/domain";
import type { Synthesis } from "../lib/model";
import { generateAnswer, validateAnswer } from "../lib/model";
import snapshot from "../data/snapshot.json";
import reviewedCalls from "../data/call-comparison-review.json";
import { reviewedComparison } from "../lib/reviewed-comparison";
const doc = (
  id: string,
  date: string,
  publishedAt: string | null = date,
): DocumentRecord => ({
  id,
  symbol: "TEST",
  title: "Earnings call",
  type: "transcript",
  url: "https://example.com/" + id,
  source: "example.com",
  period: "FY27",
  publishedAt,
  fetchedAt: "2026-11-15T12:00:00Z",
  hash: id,
  parser: "test",
  status: "extracted",
  pages: 3,
  identity: "synthetic",
  metadata: {
    status: "verified",
    callDate: date,
    discoveredPeriod: "FY27",
    receipts: [],
    warnings: [],
  },
});
const excerpt = (
  d: DocumentRecord,
  text = "Revenue growth guidance remains 3% to 5% for FY27 in constant currency.",
): Evidence => ({
  documentId: d.id,
  title: d.title,
  url: d.url,
  page: 3,
  text,
  publishedAt: d.publishedAt,
  availableAt: d.fetchedAt,
  type: "transcript",
  sourceDate: d.metadata?.callDate,
  speaker: "Named CFO",
  speakerRole: "management",
  metadataStatus: "verified",
});
const before = doc("before", "2026-07-13"),
  after = doc("after", "2026-10-12"),
  at = "2026-11-15T13:00:00Z";
const context = () =>
  selectCallContext([before, after], [excerpt(before), excerpt(after)], at);
const answer = (text: string, includeEarlier = true): Synthesis => ({
  status: "answered",
  claims: [
    {
      text,
      kind: "inference",
      citations: (includeEarlier ? [before, after] : [after]).map((d, i) => ({
        sourceId: "S" + (i + 1),
        quote: excerpt(d).text,
        evidence: excerpt(d),
      })),
    },
  ],
  gaps: [],
  model: "test",
  provider: "test",
  cached: false,
  generatedAt: at,
  validation: {
    acceptedClaims: 1,
    rejectedClaims: 0,
    rejectionReasons: [],
    quoteChecks: true,
    note: "test",
  },
  usage: { inputTokens: 1, outputTokens: 1, requests: 1, durationMs: 1 },
});
test("call pairing sorts verified dates, deduplicates mirrors and excludes investor-day documents", () => {
  const duplicate = { ...after, id: "mirror" },
    investor = {
      ...doc("investor", "2026-11-01"),
      type: "investor_presentation",
    };
  const c = selectCallContext(
    [investor, duplicate, before, after],
    [investor, duplicate, before, after].map((d) => excerpt(d)),
    at,
  );
  assert.equal(c.calls.length, 2);
  assert.equal(c.pair?.earlier.date, before.metadata?.callDate);
  assert.equal(c.pair?.later.date, after.metadata?.callDate);
});
test("publication eligibility and source call dates both constrain comparisons", () => {
  const unknown = doc("unknown", "2026-10-12", null);
  assert.equal(
    selectCallContext(
      [before, unknown],
      [excerpt(before), excerpt(unknown)],
      "2026-10-20",
    ).pair,
    null,
  );
  const future = doc("future", "2027-01-01", "2026-10-13");
  assert.equal(
    selectCallContext([before, future], [excerpt(before), excerpt(future)], at)
      .pair,
    null,
  );
});
test("unverified/conflicting dates never silently become a previous call", () => {
  const uncertain = {
    ...after,
    metadata: { ...after.metadata!, status: "unverified" as const },
  };
  const c = selectCallContext(
    [before, uncertain],
    [excerpt(before), excerpt(uncertain)],
    at,
  );
  assert.equal(c.pair, null);
  assert.ok(c.gaps.some((g) => g.includes("not be consecutive")));
});
test("caller cannot compare the same call, reverse chronology or select a foreign document", () => {
  for (const ids of [
    ["after", "before"],
    ["before", "before"],
    ["foreign", "after"],
    ["before", undefined],
  ])
    assert.throws(() =>
      selectCallContext(
        [before, after],
        [excerpt(before), excerpt(after)],
        at,
        "guidance",
        ids[0],
        ids[1],
      ),
    );
});
test("comparison context has balanced excerpts and excludes analyst question premises", () => {
  const c = selectCallContext(
    [before, after],
    [
      excerpt(before),
      {
        ...excerpt(before),
        text: "Analyst asks about revenue guidance 50%",
        speakerRole: "analyst",
      },
      excerpt(after),
    ],
    at,
  );
  assert.deepEqual(
    new Set(c.evidence.map((e) => e.documentId)),
    new Set(["before", "after"]),
  );
  assert.ok(c.evidence.every((e) => e.speakerRole !== "analyst"));
});
test("a one-sided quote cannot support a call-to-call comparison", () => {
  const c = validateComparison(
    answer("Revenue guidance remained unchanged.", false),
    context().pair!,
  );
  assert.equal(c.claims.length, 0);
  assert.ok(
    c.validation.rejectionReasons.includes("comparison_requires_both_calls"),
  );
});
test("missing mentions do not establish a new or resolved risk", () => {
  for (const text of [
    "Pricing is a new risk in the later call.",
    "Demand risk has been resolved in the later call.",
    "Management no longer expects pricing pressure.",
  ])
    assert.equal(
      validateComparison(answer(text), context().pair!).claims.length,
      0,
    );
  assert.equal(
    validateComparison(
      answer("Management reaffirmed the same revenue growth guidance."),
      context().pair!,
    ).claims.length,
    1,
  );
});
test("comparison with an acquisition basis change must preserve that qualification", () => {
  const a = answer("Management upgraded revenue growth guidance.");
  a.claims[0].citations[0].quote =
    "Revenue guidance excludes acquisitions and remains 1% to 4%.";
  a.claims[0].citations[1].quote =
    "Guidance includes acquisitions and now is 2.5% to 4%.";
  assert.equal(validateComparison(a, context().pair!).claims.length, 0);
  a.claims[0].text =
    "The reporting basis changed to include acquisitions; the ranges are not comparable.";
  assert.equal(validateComparison(a, context().pair!).claims.length, 1);
});
test("colon-free management turns survive rosters, page breaks and analyst questions", () => {
  const d = doc("speaker", "2026-07-13");
  const pages = [
    "CORPORATE PARTICIPANTS:\nSalil Parekh\nChief Executive Officer\nRishi Basu\nAVP Corporate Communications\nJOURNALISTS:\nRitu Singh\nCNBC TV18",
    "Salil Parekh\nRevenue demand remains uncertain but our guidance is unchanged for the year. We continue investing in capacity and growth.",
    "Our revenue growth guidance is 1.5% to 3% for the financial year in constant currency.\nRitu Singh\nIs management expecting revenue growth of 50%? Please explain the outlook for capacity and demand.",
  ];
  const p = extractPassages(d, pages);
  const guidance = p.find((x) => x.text.includes("1.5%"));
  assert.equal(guidance?.speaker, "Salil Parekh");
  assert.equal(guidance?.speakerRole, "management");
  assert.ok(!guidance?.text.includes("50%"));
  assert.equal(p.find((x) => x.text.includes("50%"))?.speakerRole, "analyst");
});
test("reindexed real Infosys guidance belongs to management on both calls", () => {
  for (const [id, page] of [
    ["doc-bdc83ce116f1336145a1", 6],
    ["doc-b8e9a931ed54ee49a23f", 4],
  ] as const) {
    const p = snapshot.passages.find(
      (p) =>
        p.documentId === id &&
        p.page === page &&
        p.text.includes("revenue growth guidance"),
    );
    assert.equal(p?.speaker, "Salil Parekh");
    assert.equal(p?.speakerRole, "management");
  }
});
test("quality assertions reject transport-successful wrong facts and sources", () => {
  const body = {
    synthesis: answer("Management reaffirmed revenue guidance of 3% to 5%."),
    pair: context().pair,
  };
  assert.equal(
    assessQuality(body, { mode: "answer", required: ["99%"] }).passed,
    false,
  );
  assert.equal(
    assessQuality(body, { mode: "answer", sources: [{ documentId: "other" }] })
      .passed,
    false,
  );
  assert.equal(
    assessQuality(body, {
      mode: "answer",
      required: ["3% to 5%"],
      paired: true,
    }).passed,
    true,
  );
  assert.equal(
    assessQuality(
      { synthesis: null, modelError: { code: "daily_limit" } },
      { mode: "abstain" },
    ).passed,
    false,
  );
});

test("verified attribution dates are not financial numbers; invented days still fail", () => {
  const e = excerpt(after);
  const draft = (day: number) => ({
    status: "answered",
    claims: [
      {
        text: `In the October ${day}, 2026 call, revenue growth guidance remains 3% to 5% for FY27 in constant currency.`,
        kind: "reported",
        citations: [{ sourceId: "S1", quote: e.text }],
      },
    ],
    gaps: [],
  });
  assert.equal(validateAnswer(draft(12), [e]).claims.length, 1);
  assert.equal(validateAnswer(draft(19), [e]).claims.length, 0);
});

test("comparison repair retains both calls in each claim", async () => {
  let count = 0;
  const all = [excerpt(before), excerpt(after)],
    pair = context().pair!;
  const c = (both: boolean) => ({
    status: "answered",
    claims: [
      {
        text: "Revenue growth guidance remains 3% to 5% for FY27 in constant currency in both calls.",
        kind: "inference",
        citations: (both ? all : [all[1]]).map((e, i) => ({
          sourceId: both ? `S${i + 1}` : "S2",
          quote: e.text,
        })),
      },
    ],
    gaps: [],
  });
  const output = await generateAnswer(
    {
      apiKey: "synthetic",
      company: { symbol: "TEST", name: "Synthetic", isin: "test" },
      question: "Compare guidance",
      asOf: at,
      evidence: all,
      taskInstructions: "Each claim must cite both calls.",
      comparisonContract: true,
      validateDraft: (a) => validateComparison(a, pair),
    },
    async (_url, init) => {
      const b = JSON.parse(String(init?.body));
      count++;
      if (count === 2) {
        assert.match(b.messages.at(-1).content, /Do not split/);
        assert.match(
          b.messages.at(-1).content,
          /comparison_requires_both_calls/,
        );
      }
      return Response.json({
        choices: [{ message: { content: JSON.stringify(c(count === 2)) } }],
        usage: { prompt_tokens: 100, completion_tokens: 100 },
      });
    },
  );
  assert.equal(count, 2);
  assert.equal(output.claims.length, 1);
  assert.equal(output.claims[0].citations.length, 2);
});

test("a contextual guidance quote is not a contradictory metric binding", () => {
  const review = reviewedCalls.observations.find(
    (o) => o.id === "hcl-fy27-revenue-guidance-basis",
  )!;
  const evidence = [review.beforeEvidence, review.afterEvidence].map((e) => ({
    ...e,
    text: e.quote,
    title: "Reviewed primary transcript",
    sourceDate: e.callDate,
    publishedAt: null,
    type: "transcript",
    speakerRole: "management" as const,
  }));
  const claim = {
    text: "In the July 13, 2026 call, FY27 company revenue growth guidance was 1% to 4% on an organic basis; in the October 12, 2026 call it was 2.5% to 4% including acquisitions. These ranges are not like-for-like.",
    kind: "inference",
    citations: evidence.map((e, i) => ({
      sourceId: `S${i + 1}`,
      quote: e.text,
    })),
  };
  assert.equal(
    validateAnswer({ status: "answered", claims: [claim], gaps: [] }, evidence)
      .claims.length,
    1,
  );
});
test("a comparison cannot mix revenue guidance with margin impact", () => {
  const a = answer(
    "Revenue growth guidance includes acquisitions while margin guidance remains the same.",
  );
  assert.equal(validateComparison(a, context().pair!).claims.length, 0);
});

test("reviewed comparisons bind the exact source pair and require no model request", () => {
  for (const symbol of ["INFY", "HCLTECH", "POLYCAB"]) {
    const c = selectCallContext(
      snapshot.documents.filter((d) => d.symbol === symbol) as DocumentRecord[],
      snapshot.passages as Evidence[],
      at,
    );
    const reviewed = reviewedComparison(c);
    assert.ok(reviewed, symbol);
    assert.equal(reviewed.usage.requests, 0);
    assert.equal(reviewed.provider, "Primary-source review");
    assert.ok(reviewed.claims.every((claim) => claim.citations.length === 2));
    assert.equal(reviewedComparison({ ...c, focus: "demand" }), null);
    assert.equal(
      reviewedComparison({
        ...c,
        pair: { ...c.pair!, later: { ...c.pair!.later, id: "changed-hash" } },
      }),
      null,
    );
  }
});
test("a ceremonial earlier quote and unlabelled speaker do not establish a comparison", () => {
  const a = answer(
    "The earlier call does not contain a comparable statement, so this comparison is one-sided.",
  );
  assert.equal(validateComparison(a, context().pair!).claims.length, 0);
  const b = answer("Management reaffirmed growth guidance.");
  b.claims[0].citations[1].evidence.speakerRole = "unknown";
  assert.equal(validateComparison(b, context().pair!).claims.length, 0);
});
