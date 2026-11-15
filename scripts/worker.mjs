// Persisted jobs are driven by this server process, independent of browser tabs.
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
const origin = process.env.FINN_ORIGIN || "http://127.0.0.1:5173";
const url = new URL(origin);
const local = ["127.0.0.1", "localhost"].includes(url.hostname);
if (!local && url.protocol !== "https:")
  throw new Error("Remote workers require HTTPS");
let key = process.env.FINN_MONITOR_KEY;
if (local && !key)
  key = parseEnv(await readFile(".dev.vars", "utf8")).FINN_MONITOR_KEY;
if (!key || key.length < 32)
  throw new Error("Configure FINN_MONITOR_KEY on the server and runner.");
let stopped = false;
for (const event of ["SIGINT", "SIGTERM"])
  process.on(event, () => {
    stopped = true;
  });
do {
  try {
    const response = await fetch(origin + "/api/worker", {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: "{}",
      signal: AbortSignal.timeout(240000),
    });
    if (!response.ok) throw new Error(`Worker HTTP ${response.status}`);
    const result = await response.json();
    if (result.advanced || process.argv.includes("--once"))
      console.log(JSON.stringify({ at: new Date().toISOString(), ...result }));
  } catch (e) {
    console.error(e.message);
    if (process.argv.includes("--once")) process.exitCode = 1;
  }
  if (process.argv.includes("--once") || stopped) break;
  await new Promise((r) => setTimeout(r, 2000));
} while (!stopped);
