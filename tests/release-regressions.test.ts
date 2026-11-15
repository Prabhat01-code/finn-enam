import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { extractResults } from "../lib/results-extraction";
import { authorizeWorker } from "../lib/worker-auth";
import {
  searchPassages,
  type DocumentRecord,
  type Evidence,
} from "../lib/domain";
import { generateAnswer } from "../lib/model";
import snapshot from "../data/snapshot.json";
const table = readFileSync(
  new URL("./fixtures/havells-quarter-table.txt", import.meta.url),
  "utf8",
);
const doc = {
  id: "doc-aa369a8d5be0f040b6b7",
  type: "results",
  title: "Havells Q2 FY27 results",
  url: "https://nsearchives.nseindia.in/corporate/HAVELLS1_22102026135828_QuickResults_Q2_22102026.pdf",
  publishedAt: "2026-10-22",
  fetchedAt: "2026-11-15",
} as DocumentRecord;
test("real consolidated table uses three quarters, excludes YTD and distinguishes PAT basis", () => {
  const r = extractResults(doc, [table])!;
  assert.equal(r.currentLabel, "2026-09-30");
  assert.equal(r.previousLabel, "2026-06-30");
  assert.equal(r.yearAgoLabel, "2025-09-30");
  assert.deepEqual(
    r.metrics.map((m) => m.current),
    [6431.99, null, 472.62, 349.22],
  );
  assert.equal(r.metrics[0].previous, 6518.19);
  assert.equal(r.metrics[0].yearAgo, 4779.33);
  assert.match(r.metrics[3].note!, /non-controlling/);
  for (const invalid of [
    table.replaceAll("CONSOLIDATED", "STANDALONE"),
    table.replaceAll("30-Jun-26", "30-Sep-26"),
    table.replace("crores", "lakhs"),
  ])
    assert.equal(extractResults(doc, [invalid]), null);
});
test("business overview retrieves operational descriptions instead of auditor boilerplate", () => {
  const ids = new Set(
    snapshot.documents.filter((d) => d.symbol === "INFY").map((d) => d.id),
  );
  const rows = searchPassages(
    "What business does Infosys operate, according to its annual report?",
    (snapshot.passages as Evidence[]).filter((e) => ids.has(e.documentId)),
    "2026-11-15T23:59:59Z",
    4,
  );
  assert.ok(
    rows.some((e) =>
      /Infosys.{0,100}(?:provides|provider|leader).{0,70}consulting and technology services/i.test(
        e.text,
      ),
    ),
  );
});
test("public worker rejects absent/wrong credentials and accepts a matching service digest", async () => {
  const token = "synthetic-service-credential";
  const config = {
    serviceTokenHash: createHash("sha256").update(token).digest("hex"),
  };
  assert.equal(
    await authorizeWorker(new Request("https://example.com"), config),
    false,
  );
  assert.equal(
    await authorizeWorker(
      new Request("https://example.com", {
        headers: { "x-finn-service-authorization": "Bearer wrong" },
      }),
      config,
    ),
    false,
  );
  assert.equal(
    await authorizeWorker(
      new Request("https://example.com", {
        headers: { "x-finn-service-authorization": `Bearer ${token}` },
      }),
      config,
    ),
    true,
  );
  assert.equal(
    await authorizeWorker(
      new Request("https://example.com", {
        headers: { authorization: "Bearer " + "x".repeat(32) },
      }),
      { key: "x".repeat(32) },
    ),
    true,
  );
});
test("ordinary explanation repair does not inherit two-call comparison instructions", async () => {
  const evidence: Evidence[] = [
    {
      documentId: "synthetic",
      title: "Synthetic",
      url: "https://example.com",
      page: 1,
      type: "transcript",
      publishedAt: "2026-10-01",
      text: "Revenue was affected by softer demand in the quarter.",
    },
  ];
  let calls = 0;
  await generateAnswer(
    {
      apiKey: "synthetic",
      company: { symbol: "TEST", name: "Test", isin: "TEST" },
      question: "Why did revenue fall?",
      asOf: "2026-11-15",
      evidence,
      taskInstructions: "Explain only the supported cause.",
    },
    async (_url, init) => {
      const messages = JSON.parse(init!.body as string).messages;
      if (calls++)
        assert.doesNotMatch(
          messages.at(-1).content,
          /Preserve the call-comparison contract/,
        );
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify(
                  calls === 1
                    ? {
                        status: "answered",
                        claims: [
                          {
                            text: "Revenue fell by 99 percent.",
                            kind: "reported",
                            citations: [
                              { sourceId: "S1", quote: evidence[0].text },
                            ],
                          },
                        ],
                        gaps: [],
                      }
                    : {
                        status: "insufficient_evidence",
                        claims: [],
                        gaps: ["No supported magnitude."],
                      },
                ),
              },
            },
          ],
        }),
      );
    },
  );
  assert.equal(calls, 2);
});
