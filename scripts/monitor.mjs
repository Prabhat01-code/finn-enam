// Unattended runner. Set FINN_ORIGIN and FINN_MONITOR_KEY in the environment.
// It advances persistent jobs; no browser or publication is required.
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
const origin = process.env.FINN_ORIGIN || "http://127.0.0.1:5173";
const local = ["127.0.0.1", "localhost"].includes(new URL(origin).hostname);
if (!local && new URL(origin).protocol !== "https:")
  throw new Error("Remote monitor requires HTTPS");
let key = process.env.FINN_MONITOR_KEY;
if (local && !key) {
  try {
    key = parseEnv(await readFile(".dev.vars", "utf8")).FINN_MONITOR_KEY;
  } catch {}
}
if (!key)
  throw new Error(
    "Configure the server and runner with FINN_MONITOR_KEY; never put the key in the URL.",
  );
const interval =
  Math.max(15, Number(process.env.FINN_INTERVAL_MINUTES) || 30) * 60000;
const call = async (body) => {
  const r = await fetch(origin + "/api/monitor", {
    method: "POST",
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  });
  if (!r.ok) throw new Error("Monitor HTTP " + r.status);
  return r.json();
};
async function run() {
  const { jobs } = await call({});
  for (let job of jobs) {
    let steps = 0;
    while (job.status === "running" && steps++ < 40)
      job = await call({ jobId: job.id });
    console.log(
      JSON.stringify({
        finishedAt: new Date().toISOString(),
        status: job.status,
        completed: job.progress,
        total: job.total,
        warnings: job.warnings?.length ?? 0,
      }),
    );
  }
}
do {
  try {
    await run();
  } catch (e) {
    console.error(e.message);
    if (process.argv.includes("--once")) process.exitCode = 1;
  }
  if (process.argv.includes("--once")) break;
  await new Promise((resolve) => setTimeout(resolve, interval));
} while (true);
