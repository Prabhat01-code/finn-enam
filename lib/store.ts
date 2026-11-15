import { env } from "cloudflare:workers";
export const db = () => {
  if (!env.DB) throw new Error("Database binding unavailable");
  return env.DB;
};
export async function put(
  kind: string,
  id: string,
  payload: unknown,
  symbol?: string,
  publishedAt?: string | null,
) {
  await db()
    .prepare(
      "INSERT INTO records(kind,id,symbol,published_at,payload,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET symbol=excluded.symbol,published_at=excluded.published_at,payload=excluded.payload,updated_at=excluded.updated_at",
    )
    .bind(
      kind,
      id,
      symbol ?? null,
      publishedAt ?? null,
      JSON.stringify(payload),
      new Date().toISOString(),
    )
    .run();
}
export async function get<T>(kind: string, id: string): Promise<T | null> {
  const row = await db()
    .prepare("SELECT payload FROM records WHERE kind=? AND id=?")
    .bind(kind, id)
    .first<{ payload: string }>();
  return row ? JSON.parse(row.payload) : null;
}
export async function list<T>(kind: string, symbol?: string): Promise<T[]> {
  const q = symbol
    ? db()
        .prepare(
          "SELECT payload FROM records WHERE kind=? AND symbol=? ORDER BY published_at DESC",
        )
        .bind(kind, symbol)
    : db()
        .prepare(
          "SELECT payload FROM records WHERE kind=? ORDER BY published_at DESC",
        )
        .bind(kind);
  const r = await q.all<{ payload: string }>();
  return r.results.map((x) => JSON.parse(x.payload));
}
export async function remove(kind: string, id: string) {
  await db()
    .prepare("DELETE FROM records WHERE kind=? AND id=?")
    .bind(kind, id)
    .run();
}
export async function insertOnce(
  kind: string,
  id: string,
  payload: unknown,
  symbol?: string,
  date?: string,
) {
  const r = await db()
    .prepare(
      "INSERT OR IGNORE INTO records(kind,id,symbol,published_at,payload,updated_at) VALUES(?,?,?,?,?,?)",
    )
    .bind(
      kind,
      id,
      symbol ?? null,
      date ?? null,
      JSON.stringify(payload),
      new Date().toISOString(),
    )
    .run();
  return r.meta.changes > 0;
}
