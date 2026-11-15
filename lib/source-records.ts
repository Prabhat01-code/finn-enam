import type { DocumentRecord } from "./domain";
import { sourceKey } from "./collectors";
export function currentDocuments(rows: DocumentRecord[]) {
  const bySource = new Map<string, DocumentRecord>();
  for (const row of [...rows].sort((a, b) =>
    a.fetchedAt.localeCompare(b.fetchedAt),
  )) {
    const key = sourceKey(row.url),
      existing = bySource.get(key);
    if (existing?.status === "extracted" && row.status !== "extracted")
      continue;
    bySource.set(key, row);
  }
  return [...bySource.values()];
}
