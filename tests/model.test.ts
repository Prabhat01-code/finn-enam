import test from "node:test";
import assert from "node:assert/strict";
import {
  generateAnswer,
  validateAnswer,
  MODEL,
  ModelError,
} from "../lib/model";
import {
  searchPassages,
  type Evidence,
  type DocumentRecord,
} from "../lib/domain";
import { extractPassages } from "../lib/passages";
import snapshot from "../data/snapshot.json";

const evidence: Evidence[] = [
  {
    documentId: "synthetic-only",
    title: "Synthetic test transcript",
    url: "https://example.com/report.pdf",
    page: 4,
    type: "transcript",
    publishedAt: "2025-01-21",
    text: "For the full year FY25, our revenue growth guidance is 4.5% to 5.0% in constant currency.",
  },
];
const claim = {
  text: "For FY25, revenue growth guidance is 4.5% to 5.0% in constant currency.",
  kind: "reported",
  citations: [{ sourceId: "S1", quote: evidence[0].text }],
};
const payload = (claims: unknown[]) => ({
  status: "answered",
  claims,
  gaps: [],
});
test("source-backed claims retain server-owned links and pages", () => {
  const result = validateAnswer(payload([claim]), evidence);
  assert.equal(result.status, "answered");
  assert.equal(result.claims[0].citations[0].evidence.url, evidence[0].url);
  assert.equal(result.claims[0].citations[0].evidence.page, 4);
});
test("fabricated source IDs, altered quotes and unsupported numbers are withheld", () => {
  for (const changed of [
    { ...claim, citations: [{ sourceId: "S99", quote: evidence[0].text }] },
    {
      ...claim,
      citations: [
        {
          sourceId: "S1",
          quote: "The company achieved revenue growth of 99%.",
        },
      ],
    },
    { ...claim, text: "FY25 guidance is 99% revenue growth." },
  ]) {
    const r = validateAnswer(payload([changed]), evidence);
    assert.equal(r.status, "insufficient_evidence");
    assert.equal(r.claims.length, 0);
    assert.equal(r.validation.rejectedClaims, 1);
  }
});
test("invalid structures cannot smuggle model-written URLs or uncited answers", () => {
  assert.throws(
    () =>
      validateAnswer(
        { ...payload([claim]), answer: "Uncited answer" },
        evidence,
      ),
    ModelError,
  );
  assert.throws(
    () =>
      validateAnswer(
        payload([
          {
            ...claim,
            citations: [
              { ...claim.citations[0], url: "https://attacker.example" },
            ],
          },
        ]),
        evidence,
      ),
    ModelError,
  );
  const r = validateAnswer(
    {
      status: "insufficient_evidence",
      claims: [claim],
      gaps: ["A matching actual result is missing."],
    },
    evidence,
  );
  assert.equal(r.claims.length, 0);
});
test("adapter sends a bounded authenticated request to the fixed Hyde endpoint", async () => {
  let calls = 0;
  const fetcher = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls++;
    assert.equal(url, "https://inference.hyde.tech/v1/chat/completions");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer synthetic-key",
    );
    const body = JSON.parse(init?.body as string);
    assert.equal(body.model, MODEL);
    assert.equal(body.reasoning_effort, "low");
    assert.equal(body.max_tokens, 6144);
    assert.equal(body.stream, false);
    assert.equal(init?.redirect, "manual");
    assert.equal(body.messages[0].role, "system");
    assert.match(body.messages[0].content, /untrusted/);
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(payload([claim])) },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 80 },
      }),
    );
  };
  const r = await generateAnswer(
    {
      apiKey: "synthetic-key",
      company: { symbol: "TEST", name: "Test", isin: "test" },
      question: "What is guidance?",
      asOf: "2025-02-01",
      evidence,
    },
    fetcher as typeof fetch,
  );
  assert.equal(calls, 1);
  assert.equal(r.usage.inputTokens, 100);
  assert.equal(r.claims.length, 1);
});
test("upstream errors never echo provider response bodies or credentials", async () => {
  await assert.rejects(
    () =>
      generateAnswer(
        {
          apiKey: "synthetic-key",
          company: { symbol: "TEST", name: "Test", isin: "test" },
          question: "Guidance?",
          asOf: "2025-02-01",
          evidence,
        },
        (async () =>
          new Response("sensitive echoed input", {
            status: 401,
          })) as typeof fetch,
      ),
    (error: unknown) =>
      error instanceof ModelError &&
      error.code === "authentication" &&
      !error.message.includes("sensitive") &&
      !error.message.includes("synthetic-key"),
  );
});
test("truncated model output is rejected before it reaches the user", async () => {
  await assert.rejects(
    () =>
      generateAnswer(
        {
          apiKey: "synthetic-key",
          company: { symbol: "TEST", name: "Test", isin: "test" },
          question: "Guidance?",
          asOf: "2025-02-01",
          evidence,
        },
        (async () =>
          Response.json({
            choices: [
              { finish_reason: "length", message: { content: '{"claims":[' } },
            ],
          })) as typeof fetch,
      ),
    (error: unknown) =>
      error instanceof ModelError && error.code === "truncated",
  );
});
test("retrieval respects timestamps and diversifies duplicated source windows", () => {
  const rows = [
    ...Array.from({ length: 8 }, (_, i) => ({ ...evidence[0], page: i + 1 })),
    {
      ...evidence[0],
      documentId: "other",
      text: "Revenue guidance outlook for the next financial year is uncertain.",
    },
    {
      ...evidence[0],
      documentId: "future",
      publishedAt: "2025-03-01",
      text: "Future revenue guidance should be excluded.",
    },
  ];
  const hits = searchPassages("revenue guidance", rows, "2025-02-01");
  assert.deepEqual(
    new Set(hits.map((x) => x.documentId)),
    new Set(["synthetic-only", "other"]),
  );
  assert.equal(hits.length, 2);
  assert.deepEqual(searchPassages("bananas rocket", rows, "2025-02-01"), []);
});
test("correction is bounded to one additional request and counted in usage", async () => {
  let calls = 0,
    reservations = 0;
  const fetcher = async () => {
    calls++;
    const bad = { ...claim, text: "Revenue guidance was 99%." };
    return Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify(payload([calls === 1 ? bad : claim])),
          },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });
  };
  const result = await generateAnswer(
    {
      apiKey: "synthetic-key",
      company: { symbol: "TEST", name: "Test", isin: "test" },
      question: "Guidance?",
      asOf: "2025-02-01",
      evidence,
      reserveRepair: async () => {
        reservations++;
        return true;
      },
    },
    fetcher as typeof fetch,
  );
  assert.equal(calls, 2);
  assert.equal(reservations, 1);
  assert.equal(result.validation.rejectedClaims, 0);
  assert.equal(result.usage.inputTokens, 200);
  assert.equal(result.usage.requests, 2);
});
test("real historical retrieval includes matching FY25 target and actual, without future sources", () => {
  const ids = new Set(
    snapshot.documents.filter((d) => d.symbol === "INFY").map((d) => d.id),
  );
  const hits = searchPassages(
    "What was the final FY25 revenue growth guidance and what was the actual full-year growth? State the reporting basis.",
    snapshot.passages.filter((p) => ids.has(p.documentId)) as Evidence[],
    "2025-04-23T00:00:00Z",
  );
  assert.ok(
    hits.some(
      (p) =>
        /4\.5%.*5%/.test(p.text) &&
        /guidance/.test(p.text) &&
        /Jan 2025/.test(p.title),
    ),
  );
  assert.ok(
    hits.some(
      (p) => /4\.2%/.test(p.text) && /financial year 2025/.test(p.text),
    ),
  );
  assert.ok(
    hits.every(
      (p) =>
        Date.parse(p.publishedAt ?? p.availableAt!) <=
        Date.parse("2025-04-23T00:00:00Z"),
    ),
  );
});
test("late-page guidance survives extraction after earlier revenue paragraphs", () => {
  const paragraph =
    "Our business revenue grew, with strong demand in the quarter. ".repeat(30);
  const doc = {
    id: "synthetic",
    title: "Synthetic transcript",
    url: "https://example.com",
    publishedAt: "2025-01-01",
    fetchedAt: "2025-01-02",
    type: "transcript",
  } as DocumentRecord;
  const rows = extractPassages(doc, [
    paragraph +
      "Our guidance for full-year revenue growth is 4% to 5%. This reflects the expected demand for the coming year.",
  ]);
  assert.ok(rows.some((p) => p.text.includes("guidance for full-year")));
});
