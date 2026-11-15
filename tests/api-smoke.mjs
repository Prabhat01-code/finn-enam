import assert from "node:assert/strict";
const base = process.env.FINN_ORIGIN ?? "http://127.0.0.1:5173";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Use an isolated local preview for mutation tests.");
let cookie = "";
async function request(path, body, expected = 200) {
  const r = await fetch(base + "/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const next = r.headers.get("set-cookie");
  if (next) cookie = next.split(";")[0];
  const data = await r.json();
  assert.equal(r.status, expected, JSON.stringify(data));
  return data;
}
assert.equal((await request("health")).status, "ok");
const initial = await request("dashboard");
assert.equal(initial.portfolio.length, 18);
const touched = [];
try {
  await request(
    "settings",
    { priceThreshold: 0, volumeMultiplier: 2, categories: [] },
    400,
  );
  await request("settings", {
    priceThreshold: 1.5,
    volumeMultiplier: 1.8,
    categories: ["results"],
  });
  assert.equal((await request("dashboard")).rules.priceThreshold, 1.5);
  await request("portfolio", { symbols: [] });
  const empty = await request("dashboard");
  assert.equal(empty.portfolio.length, 0);
  assert.equal(empty.snapshotEvents.length, 0);
  await request("portfolio", { symbols: ["INFY", "ASIANPAINT"] });
  assert.equal((await request("dashboard")).portfolio.length, 2);
  const research = await request(
    "research?symbol=ASIANPAINT&q=revenue%20growth",
  );
  assert.ok(research.coverage.annualReports >= 1);
  assert.ok(research.evidence.length > 0);
  assert.equal(
    (await request("research?symbol=INFY&q=xyqznotaword")).evidence.length,
    0,
  );
  await request("research?symbol=NOT_A_REAL_TICKER", undefined, 400);
  for (let start = 0; start < 520; start += 20) {
    const ids = Array.from({ length: 20 }, (_, i) => `test-${start + i}`);
    touched.push(...ids);
    await Promise.all(ids.map((id) => request("read", { id, read: true })));
  }
  const state = await request("dashboard");
  assert.equal(touched.filter((id) => state.read.includes(id)).length, 520);
  const second = await fetch(base + "/api/dashboard");
  assert.ok(
    !(await second.json()).read.includes("test-0"),
    "Anonymous sessions must be isolated",
  );
  await request("monitor", {}, 403);
  // Offline API assertions do not depend on mutable external feeds. Opt in to network jobs.
  if (process.env.FINN_TEST_LIVE === "1") {
    let firstAlerts;
    for (let i = 0; i < 2; i++) {
      let job = await request("refresh", {}, 202);
      let calls = 0;
      while (job.status === "running" && calls++ < 8)
        job = await request("jobs/" + job.id + "/step", {});
      assert.equal(job.status, "complete", JSON.stringify(job));
      const d = await request("dashboard");
      assert.equal(new Set(d.alerts.map((a) => a.id)).size, d.alerts.length);
      if (i === 0) firstAlerts = d.alerts.length;
      else assert.equal(d.alerts.length, firstAlerts);
    }
  }
  console.log(
    "PASS: independent visitor state, empty portfolio, source search, 520 concurrent read updates, settings validation and monitor authentication.",
  );
} finally {
  await request("settings", initial.rules);
  await request("portfolio", {
    symbols: initial.portfolio.map((c) => c.symbol),
  });
  for (let i = 0; i < touched.length; i += 20)
    await Promise.all(
      touched
        .slice(i, i + 20)
        .map((id) => request("read", { id, read: initial.read.includes(id) })),
    );
}
