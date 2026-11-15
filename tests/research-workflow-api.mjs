import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const origin = "http://127.0.0.1:5173";
let cookie = "";
async function request(path, body) {
  const r = await fetch(origin + "/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  cookie = r.headers.get("set-cookie")?.split(";")[0] ?? cookie;
  return { http: r.status, body: await r.json() };
}
const before = (await request("dashboard")).body.portfolio.map((c) => c.symbol);
for (const symbol of ["INFY", "HCLTECH", "POLYCAB"]) {
  const { http, body } = await request("answer", {
    symbol,
    question: "What was revenue growth?",
  });
  assert.equal(http, 200);
  assert.equal(body.plan.intent, "numerical");
  assert.equal(body.structured.status, "answered");
  assert.equal(body.structured.calculations.length, 2);
  assert.equal(body.synthesis, null);
  assert.equal(body.modelError, null);
}
const premise = (
  await request("answer", {
    symbol: "POLYCAB",
    question: "Why did revenue fall QoQ?",
  })
).body;
assert.equal(premise.structured.premise, "contradicted");
assert.equal(premise.synthesis, null);
const replay = (
  await request("answer", {
    symbol: "HCLTECH",
    question: "What was revenue growth?",
    asOf: "2020-01-01T00:00:00Z",
  })
).body;
assert.equal(replay.structured.status, "insufficient_evidence");
assert.equal(replay.structured.evidence.length, 0);
const historical = (
  await request("company-page", {
    symbol: "HAVELLS",
    asOf: "2020-01-01T00:00:00Z",
  })
).body;
assert.equal(historical.job, null);
assert.equal(historical.page.coverage.passages, 0);
await request("company-page?symbol=POLYCAB");
const cached = (await request("company-page?symbol=POLYCAB")).body;
assert.equal(cached.page.cached, true);
assert.equal(cached.page.quarterChanges.status, "supported");
assert.equal(cached.page.quarterChanges.items.length, 5);
assert.deepEqual(
  (await request("dashboard")).body.portfolio.map((c) => c.symbol),
  before,
);
assert.equal((await request("worker", {})).http, 403);
// Read back the real unfamiliar-company job, created independently of this client.
const session = JSON.parse(
  await readFile("outputs/unattended-test-session.json", "utf8"),
);
assert.equal((await request("jobs/" + session.jobId)).http, 404);
const job = await (
  await fetch(origin + "/api/jobs/" + session.jobId, {
    headers: { cookie: session.cookie },
  })
).json();
assert.equal(job.status, "complete");
const havells = (await request("company-page?symbol=HAVELLS")).body.page;
assert.ok(havells.coverage.annualReports >= 1);
assert.ok(havells.coverage.transcripts >= 1);
assert.equal(havells.quarterChanges.status, "numbers_only");
assert.equal(
  havells.results.metrics.find((m) => m.name === "Revenue").current,
  6431.99,
);
const report = {
  observedAt: new Date().toISOString(),
  status: "passed",
  numericalCompanies: 3,
  falsePremiseWithheld: true,
  historicalReplay: true,
  cacheReuse: true,
  portfolioUnchanged: true,
  workerAuthorization: true,
  jobOwnership: true,
  unattendedCompany: {
    symbol: "HAVELLS",
    status: job.status,
    coverage: havells.coverage,
  },
  chargedModelCalls: 0,
};
await writeFile(
  "docs/research-workflow-evaluation.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
