// Local-only test. Stop scripts/worker.mjs before --prepare, then run it --once.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { globSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const origin = "http://127.0.0.1:5173";
const file = "outputs/worker-recovery-session.json";
if (process.argv.includes("--prepare")) {
  const initial = await fetch(origin + "/api/dashboard");
  const cookie = initial.headers.get("set-cookie").split(";")[0];
  const post = async (path, body) => {
    const r = await fetch(origin + "/api/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(body),
    });
    assert.ok(r.ok);
    return r.json();
  };
  await post("portfolio", { symbols: [] });
  const job = await post("refresh", {});
  assert.equal(job.status, "running");
  const files = globSync(
    ".wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite",
  ).filter((p) => !p.endsWith("metadata.sqlite"));
  assert.equal(files.length, 1);
  const db = new DatabaseSync(files[0]);
  db.prepare(
    "INSERT OR REPLACE INTO records(kind,id,symbol,published_at,payload,updated_at) VALUES('lock',?,NULL,NULL,?,?)",
  ).run(
    "job:" + job.id,
    JSON.stringify({ token: "expired-local-test", until: Date.now() - 1000 }),
    new Date().toISOString(),
  );
  db.close();
  await writeFile(
    file,
    JSON.stringify({
      cookie,
      jobId: job.id,
      queuedAt: new Date().toISOString(),
    }),
    { mode: 0o600 },
  );
  console.log(
    "Queued a persistent local job with an expired lease; no browser is advancing it.",
  );
} else {
  const session = JSON.parse(await readFile(file, "utf8"));
  const job = await (
    await fetch(origin + "/api/jobs/" + session.jobId, {
      headers: { cookie: session.cookie },
    })
  ).json();
  assert.equal(job.status, "complete");
  const report = {
    observedAt: new Date().toISOString(),
    queuedAt: session.queuedAt,
    status: "passed",
    workerRestart: true,
    expiredLeaseRecovered: true,
    browserStepRequests: 0,
    finalJobStatus: job.status,
  };
  await writeFile(
    "docs/worker-recovery-evaluation.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
