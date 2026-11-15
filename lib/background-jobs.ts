import { db, put, get } from "./store";
import { acquireLease, releaseLease } from "./job-leases";
import { stepJob, type Job } from "./services";
import { monitorStep } from "./monitor";
import { env } from "cloudflare:workers";

export async function workerStatus() {
  const heartbeat = await get<{ at: string }>("worker", "heartbeat");
  const interval = Number(env.FINN_WORKER_INTERVAL_MINUTES);
  return {
    active: !!heartbeat && Date.now() - Date.parse(heartbeat.at) < 120000,
    lastSeen: heartbeat?.at ?? null,
    scheduledEveryMinutes:
      Number.isInteger(interval) && interval >= 1 && interval <= 1440
        ? interval
        : null,
  };
}
export async function drainJobs() {
  const token = await acquireLease("worker:drain", 600000);
  if (!token) return { busy: true, advanced: 0 };
  let advanced = 0;
  try {
    await put("worker", "heartbeat", { at: new Date().toISOString() });
    const lastMonitor = await get<{ at: number }>("worker", "monitor-cycle");
    if (!lastMonitor || Date.now() - lastMonitor.at >= 30 * 60000) {
      await monitorStep();
      await put("worker", "monitor-cycle", { at: Date.now() });
    }
    // Oldest updated job first: long company jobs do not starve newer work.
    const rows = await db()
      .prepare(
        "SELECT payload FROM records WHERE kind='job' AND json_extract(payload,'$.status')='running' AND COALESCE(json_extract(payload,'$.nextAttemptAt'),0)<=? ORDER BY updated_at ASC LIMIT 2",
      )
      .bind(Date.now())
      .all<{ payload: string }>();
    for (const row of rows.results) {
      const j = JSON.parse(row.payload) as Job;
      const updated = await stepJob(j.id, j.user);
      if (
        updated.status !== "running" &&
        updated.symbol &&
        updated.type === "research"
      ) {
        const { buildCompanyPage } = await import("./company-page");
        await buildCompanyPage(updated.symbol);
      }
      advanced++;
    }
    await put("worker", "heartbeat", { at: new Date().toISOString() });
    const remaining = await db()
      .prepare(
        "SELECT COUNT(*) AS n FROM records WHERE kind='job' AND json_extract(payload,'$.status')='running' AND COALESCE(json_extract(payload,'$.nextAttemptAt'),0)<=?",
      )
      .bind(Date.now())
      .first<{ n: number }>();
    return { busy: false, advanced, ready: remaining?.n ?? 0 };
  } finally {
    await releaseLease("worker:drain", token);
  }
}
