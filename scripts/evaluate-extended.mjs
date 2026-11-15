import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { assessQuality } from "../lib/evaluation.ts";
import { PROMPT_VERSION } from "../lib/model.ts";
import { COMPARISON_VERSION } from "../lib/call-comparison.ts";
const origin = process.env.FINN_ORIGIN ?? "http://127.0.0.1:5173";
if (!["127.0.0.1", "localhost"].includes(new URL(origin).hostname))
  throw new Error("Run against the local evaluation environment.");
const cases = JSON.parse(
  await readFile("data/extended-evaluation-cases.json", "utf8"),
);
const selected = process.argv.slice(2);
if (selected.some((id) => !cases.some((c) => c.id === id)))
  throw new Error("Unknown evaluation case.");
await mkdir("outputs", { recursive: true });
const cookieFile = "outputs/extended-evaluation-session.txt";
let cookie = await readFile(cookieFile, "utf8").catch(() => "");
async function request(path, body) {
  const r = await fetch(origin + "/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(145000),
  });
  const next = r.headers.get("set-cookie");
  if (next) {
    cookie = next.split(";")[0];
    await writeFile(cookieFile, cookie, { mode: 0o600 });
  }
  return { http: r.status, body: await r.json() };
}
// Source discovery is deliberately separate: tests may not quietly turn a missing
// fixture into success by changing their expected outcome.
const results = [];
for (const item of cases.filter(
  (c) => !selected.length || selected.includes(c.id),
)) {
  const started = Date.now();
  let response;
  try {
    response = await request(item.endpoint, item.input);
  } catch (e) {
    response = {
      http: 0,
      body: {
        modelError: {
          code: "transport",
          message: e instanceof Error ? e.message : "Request failed",
        },
      },
    };
  }
  const body = response.body;
  const quality = assessQuality(body, item.expected, item.input.asOf);
  const result = {
    id: item.id,
    observedAt: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    comparisonVersion: COMPARISON_VERSION,
    input: item.input,
    expected: item.expected,
    reviewNote: item.reviewNote,
    http: response.http,
    quality,
    evidenceHash: createHash("sha256")
      .update(JSON.stringify(body.evidence ?? []))
      .digest("hex"),
    evidenceCount: body.evidence?.length ?? 0,
    durationMs: Date.now() - started,
    response: body,
  };
  results.push(result);
  console.log(
    JSON.stringify({
      id: item.id,
      http: response.http,
      quality,
      modelError: body.modelError,
      claims: body.synthesis?.claims.map((c) => c.text),
      usage: body.synthesis?.usage,
    }),
  );
}
let previous = [];
try {
  previous = JSON.parse(
    await readFile("docs/extended-evaluation.json", "utf8"),
  ).results;
} catch {}
const merged = [
  ...previous.filter((p) => !results.some((r) => r.id === p.id)),
  ...results,
];
const first = results.find((r) => r.response.synthesis);
let cacheReused = null;
let reviewedRepeatStable = null;
if (first) {
  const item = cases.find((c) => c.id === first.id);
  const repeated = (await request(item.endpoint, item.input)).body;
  if (first.response.method === "source_reviewed")
    reviewedRepeatStable =
      repeated.synthesis?.usage.requests === 0 &&
      JSON.stringify(repeated.synthesis?.claims) ===
        JSON.stringify(first.response.synthesis.claims);
  else cacheReused = repeated.synthesis?.cached === true;
}
const usages = merged.map((r) => r.response.synthesis?.usage).filter(Boolean);
await writeFile(
  "docs/extended-evaluation.json",
  JSON.stringify(
    {
      runAt: new Date().toISOString(),
      note: "Incremental observed tests with explicit expected claims and source references. These are regression cases, not an accuracy benchmark. Generation uses the app quota and cache; the final comparison cases use explicitly source-reviewed observations with zero provider calls. Development used a temporary local allowance of 110 requests, then restored the default 100. Summary token totals describe retained observations, not all failed/repeated attempts. Unknown token usage is retained, not treated as zero.",
      cacheReused,
      reviewedRepeatStable,
      summary: {
        cases: merged.length,
        passed: merged.filter((r) => r.quality.passed && r.http === 200).length,
        inputTokens: usages.every((u) => u.inputTokens !== null)
          ? usages.reduce((n, u) => n + u.inputTokens, 0)
          : null,
        outputTokens: usages.every((u) => u.outputTokens !== null)
          ? usages.reduce((n, u) => n + u.outputTokens, 0)
          : null,
        requests: usages.reduce((n, u) => n + u.requests, 0),
        p50DurationMs: [...merged].sort((a, b) => a.durationMs - b.durationMs)[
          Math.floor(merged.length / 2)
        ]?.durationMs,
      },
      results: merged,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    report: "docs/extended-evaluation.json",
    cacheReused,
    reviewedRepeatStable,
    passed: merged.filter((r) => r.quality.passed).length,
    cases: merged.length,
  }),
);
if (
  results.some((r) => r.http !== 200 || !r.quality.passed) ||
  cacheReused === false ||
  reviewedRepeatStable === false
)
  process.exitCode = 1;
