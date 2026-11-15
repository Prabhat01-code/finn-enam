import { env } from "cloudflare:workers";
import { activeJobs, newJob, stepJob, type Job } from "./services";
import { db, get } from "./store";
import type { Rules } from "./domain";
import { authorizeWorker } from "./worker-auth";
export async function monitorAuthorized(request: Request) {
  return authorizeWorker(request, {
    key: env.FINN_MONITOR_KEY,
    serviceTokenHash: env.FINN_SERVICE_TOKEN_SHA256,
  });
}
export async function monitorStep(jobId?: string) {
  if (jobId) {
    const job = await get<Job>("job", jobId);
    if (
      !job ||
      (await get<Rules>("settings", job.user))?.monitorEnabled !== true
    )
      throw new Error("No subscribed job");
    return stepJob(jobId, job.user);
  }
  const subscriptions = await db()
    .prepare(
      "SELECT id FROM records WHERE kind='settings' AND json_extract(payload,'$.monitorEnabled')=1 LIMIT 25",
    )
    .all<{ id: string }>();
  const jobs: Job[] = [];
  for (const { id: user } of subscriptions.results) {
    const active = await activeJobs(user);
    jobs.push(...active);
    if (!active.some((j) => j.type === "refresh"))
      jobs.push(await newJob("refresh", user));
  }
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  await db()
    .prepare(
      "DELETE FROM records WHERE kind IN ('answer','model_run','model_budget') AND updated_at < ?",
    )
    .bind(cutoff)
    .run();
  // Recovered/failed jobs remain inspectable for a month. Active jobs are never pruned.
  await db()
    .prepare(
      "DELETE FROM records WHERE kind='job' AND updated_at < ? AND json_extract(payload,'$.status')!='running'",
    )
    .bind(cutoff)
    .run();
  return { jobs: jobs.map((j) => ({ id: j.id, status: j.status })) };
}
