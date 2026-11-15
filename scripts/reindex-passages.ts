import { readFile, readdir, writeFile } from "node:fs/promises";
import { extractPassages, PASSAGE_PARSER } from "../lib/passages";
import type { Snapshot } from "../lib/services";
const read = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const snapshot = (await read("data/snapshot.json")) as Snapshot;
const artifacts = new Map<string, string[]>();
for (const directory of ["outputs/audit-research", ".source-cache"]) {
  for (const file of await readdir(directory)) {
    if (!file.endsWith(".json")) continue;
    const raw = await read(directory + "/" + file);
    if (
      !Array.isArray(raw.pages) ||
      !raw.pages.every((p: unknown) => typeof p === "string")
    )
      continue;
    if (file.startsWith("doc-"))
      artifacts.set(file.replace(/\.json$/, ""), raw.pages);
    if (raw.downloadedSha256)
      artifacts.set("doc-" + raw.downloadedSha256.slice(0, 20), raw.pages);
    if (raw.document?.id) artifacts.set(raw.document.id, raw.pages);
  }
}
let updated = 0;
for (const doc of snapshot.documents) {
  const pages = artifacts.get(doc.id);
  if (!pages) continue;
  const extracted = extractPassages(doc, pages);
  if (!extracted.length) continue;
  snapshot.passages = snapshot.passages.filter((p) => p.documentId !== doc.id);
  snapshot.passages.push(
    ...extracted.map((p) => ({
      ...p,
      ...(doc.revision ? { revision: doc.revision } : {}),
    })),
  );
  doc.parser = PASSAGE_PARSER;
  updated++;
}
await writeFile("data/snapshot.json", JSON.stringify(snapshot));
const manifest = await read("data/source-manifest.json");
manifest.documents = snapshot.documents;
manifest.counts.passages = snapshot.passages.length;
manifest.passagesReindexedAt = new Date().toISOString();
await writeFile(
  "data/source-manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    updated,
    passages: snapshot.passages.length,
    parser: PASSAGE_PARSER,
  }),
);
