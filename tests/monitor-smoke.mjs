import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
const key = parseEnv(await readFile(".dev.vars", "utf8")).FINN_MONITOR_KEY;
if (!key) throw new Error("Configure local FINN_MONITOR_KEY");
let cookie = "";
async function call(path, body, monitor = false) {
  const r = await fetch("http://127.0.0.1:5173/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(monitor ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!monitor) {
    const next = r.headers.get("set-cookie");
    if (next) cookie = next.split(";")[0];
  }
  const d = await r.json();
  assert.equal(r.status, 200);
  return d;
}
const initial = await call("dashboard");
try {
  await call("portfolio", { symbols: ["INFY"] });
  await call("settings", {
    ...initial.rules,
    priceThreshold: 0.1,
    volumeMultiplier: 1,
    monitorEnabled: true,
  });
  let count = 0;
  for (let n = 0; n < 2; n++) {
    const { jobs } = await call("monitor", {}, true);
    assert.ok(jobs.length >= 1);
    for (let j of jobs) {
      let steps = 0;
      while (j.status === "running" && steps++ < 30)
        j = await call("monitor", { jobId: j.id }, true);
      assert.equal(j.status, "complete");
    }
    const d = await call("dashboard");
    assert.ok(
      d.alerts.length >= 1,
      "Choose a threshold producing a real alert",
    );
    if (n) assert.equal(d.alerts.length, count);
    count = d.alerts.length;
  }
  console.log(
    "PASS: authenticated unattended jobs create real alerts and deduplicate a repeated refresh.",
  );
} finally {
  await call("settings", initial.rules);
  await call("portfolio", { symbols: initial.portfolio.map((c) => c.symbol) });
}
