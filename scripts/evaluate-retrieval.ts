import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import snapshot from "../data/snapshot.json";
import cases from "../data/retrieval-evaluation-cases.json";
import { permittedCorpus, evidenceKey, rankHybrid } from "../lib/hybrid-search";
import {
  searchPassages,
  type DocumentRecord,
  type Evidence,
} from "../lib/domain";
import { embeddingInput } from "../lib/embedding-provider";
const asOf = "2026-11-15T23:59:59Z";
const docs = snapshot.documents as DocumentRecord[];
const passages = snapshot.passages as Evidence[];
const symbols = new Set(cases.map((c) => c.symbol));
const corpus = [...symbols].flatMap((s) =>
  permittedCorpus(s, docs, passages, asOf),
);
const payload = {
  model: "sentence-transformers/all-MiniLM-L6-v2",
  corpus: corpus.map((e) => ({
    key: evidenceKey(e),
    text: embeddingInput(e.text),
  })),
  queries: cases.map((c) => ({ id: c.id, text: c.question })),
};
const digest = createHash("sha256")
  .update(JSON.stringify(payload))
  .digest("hex");
await mkdir("outputs", { recursive: true });
if (process.argv.includes("--prepare")) {
  await writeFile(
    "outputs/retrieval-input.json",
    JSON.stringify({ ...payload, digest }),
  );
  console.log(
    JSON.stringify({
      passages: corpus.length,
      questions: cases.length,
      digest,
    }),
  );
} else {
  const vectorsFile = await readFile("outputs/retrieval-vectors.json", "utf8")
    .then(JSON.parse)
    .catch(() => null);
  if (vectorsFile && vectorsFile.digest !== digest)
    throw new Error("Embedding corpus/version does not match benchmark");
  const vectors = new Map<string, number[]>(
    vectorsFile
      ? corpus.map((e, i) => [evidenceKey(e), vectorsFile.passages[i]])
      : [],
  );
  const results = cases.map((c, index) => {
    const at = c.asOf ?? asOf;
    const eligible = permittedCorpus(c.symbol, docs, passages, at, c.period);
    const labels = c.anchors.map((a) =>
      eligible
        .filter(
          (e) =>
            e.documentId === a.documentId &&
            e.page === a.page &&
            e.text.includes(a.text),
        )
        .map(evidenceKey),
    );
    if (labels.some((l) => !l.length))
      throw new Error(`Missing frozen label for ${c.id}`);
    const start = performance.now();
    const ranked =
      eligible.length && vectorsFile
        ? rankHybrid(
            c.question,
            eligible,
            vectorsFile.queries[index],
            vectors,
            at,
            8,
          )
        : {
            lexical: searchPassages(c.question, eligible, at, 8),
            semantic: [],
            hybrid: [],
          };
    const metrics = Object.fromEntries(
      Object.entries(ranked).map(([mode, rows]) => {
        const keys = new Set(rows.map(evidenceKey));
        const matched = labels.filter((l) =>
          l.some((key) => keys.has(key)),
        ).length;
        return [
          mode,
          {
            recallAt8: labels.length
              ? matched / labels.length
              : rows.length === 0
                ? 1
                : 0,
            allRequiredEvidence: matched === labels.length,
            prohibitedSources: rows.filter(
              (e) => !eligible.some((p) => evidenceKey(p) === evidenceKey(e)),
            ).length,
            receipts: rows.map((e) => ({
              documentId: e.documentId,
              page: e.page,
              excerpt: e.text.slice(0, 100),
            })),
          },
        ];
      }),
    );
    return {
      id: c.id,
      eligible: eligible.length,
      requiredAnchors: labels.length,
      rankingMs: performance.now() - start,
      metrics,
    };
  });
  const aggregate = Object.fromEntries(
    ["lexical", "semantic", "hybrid"].map((mode) => [
      mode,
      {
        meanRecallAt8:
          results.reduce((s, r) => s + r.metrics[mode].recallAt8, 0) /
          results.length,
        fullEvidenceCases: results.filter(
          (r) => r.metrics[mode].allRequiredEvidence,
        ).length,
        prohibitedSources: results.reduce(
          (s, r) => s + r.metrics[mode].prohibitedSources,
          0,
        ),
      },
    ]),
  );
  const report = {
    observedAt: new Date().toISOString(),
    corpusHash: digest,
    model: vectorsFile?.model ?? null,
    embeddingMs: vectorsFile?.durationMs ?? null,
    embeddingRequests: 0,
    paidModelCalls: 0,
    method:
      "Frozen real primary-source excerpts; 12 development cases, anchor recall@8, identical company/date/period filters, RRF k=60. Local semantic model, not the deployed chat provider. Not a broad answer-quality benchmark.",
    aggregate,
    results,
  };
  await writeFile(
    "docs/retrieval-evaluation.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify({ model: report.model, aggregate }, null, 2));
}
