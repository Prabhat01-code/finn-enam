import { db, insertOnce } from "./store";
export async function acquireLease(id: string, duration = 300000) {
  const token = crypto.randomUUID();
  await db()
    .prepare(
      "DELETE FROM records WHERE kind='lock' AND id=? AND json_extract(payload,'$.until') < ?",
    )
    .bind(id, Date.now())
    .run();
  return (await insertOnce("lock", id, { token, until: Date.now() + duration }))
    ? token
    : null;
}
export async function releaseLease(id: string, token: string) {
  await db()
    .prepare(
      "DELETE FROM records WHERE kind='lock' AND id=? AND json_extract(payload,'$.token')=?",
    )
    .bind(id, token)
    .run();
}
export function retryDelay(attempts: number) {
  return Math.min(60000, 2000 * 2 ** attempts);
}
