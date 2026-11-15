import { env } from "cloudflare:workers";
import { db, get, insertOnce, list, put } from "./store";
import { sha256 } from "./collectors";
import { searchPassages, type DocumentRecord, type Evidence } from "./domain";
import { embeddingInput, embedTexts } from "./embedding-provider";
import {
  evidenceKey,
  permittedCorpus,
  rankHybrid,
  RETRIEVAL_VERSION,
} from "./hybrid-search";
export function embeddingConfig() {
  return env.FINN_EMBEDDING_BASE_URL &&
    env.FINN_EMBEDDING_API_KEY &&
    env.FINN_EMBEDDING_MODEL
    ? {
        baseUrl: env.FINN_EMBEDDING_BASE_URL,
        apiKey: env.FINN_EMBEDDING_API_KEY,
        model: env.FINN_EMBEDDING_MODEL,
        version: env.FINN_EMBEDDING_VERSION ?? "1",
      }
    : null;
}
type VectorRecord = { key: string; config: string; vector: number[] };
const configId = (c: NonNullable<ReturnType<typeof embeddingConfig>>) =>
  JSON.stringify([
    c.baseUrl,
    c.model,
    c.version,
    RETRIEVAL_VERSION,
    "max-1600-chars",
  ]);
async function reserveEmbeddingBatch() {
  const id = new Date().toISOString().slice(0, 10);
  await insertOnce("embedding_budget", id, { count: 0 });
  const limit = Math.min(
    500,
    Math.max(1, Number(env.FINN_EMBEDDING_DAILY_BATCHES) || 100),
  );
  return (
    (
      await db()
        .prepare(
          "UPDATE records SET payload=json_set(payload,'$.count',json_extract(payload,'$.count')+1) WHERE kind='embedding_budget' AND id=? AND json_extract(payload,'$.count')<?",
        )
        .bind(id, limit)
        .run()
    ).meta.changes > 0
  );
}
async function vectorsFor(symbol: string) {
  return list<VectorRecord>("embedding", symbol);
}
// One bounded ingestion stage, never an unbounded embedding call from a question.
export async function indexEmbeddingBatch(
  symbol: string,
  docs: DocumentRecord[],
  passages: Evidence[],
) {
  const config = embeddingConfig();
  if (!config) return { done: true, indexed: 0, remaining: 0, mode: "lexical" };
  const corpus = permittedCorpus(
    symbol,
    docs,
    passages,
    new Date().toISOString(),
  );
  if (corpus.length > 2000)
    return {
      done: true,
      indexed: 0,
      remaining: corpus.length,
      mode: "lexical",
      warning:
        "Embedding corpus exceeds the prototype's 2,000-passage company limit.",
    };
  const id = configId(config),
    saved = await vectorsFor(symbol);
  const keys = new Set(saved.filter((r) => r.config === id).map((r) => r.key));
  const missing = corpus.filter((e) => !keys.has(evidenceKey(e)));
  if (!missing.length)
    return {
      done: true,
      indexed: corpus.length,
      remaining: 0,
      mode: "hybrid_ready",
    };
  if (!(await reserveEmbeddingBatch()))
    throw new Error(
      "Embedding daily budget exhausted; lexical search remains available.",
    );
  const batch = missing.slice(0, 16);
  const response = await embedTexts(
    config,
    batch.map((e) => embeddingInput(e.text)),
  );
  for (const [i, e] of batch.entries()) {
    const key = evidenceKey(e);
    await put(
      "embedding",
      await sha256(id + key),
      { key, config: id, vector: response.vectors[i] },
      symbol,
    );
  }
  await put(
    "embedding_run",
    crypto.randomUUID(),
    {
      symbol,
      count: batch.length,
      tokens: response.tokens,
      model: config.model,
      at: new Date().toISOString(),
    },
    symbol,
  );
  return {
    done: missing.length <= batch.length,
    indexed: corpus.length - missing.length + batch.length,
    remaining: missing.length - batch.length,
    mode: "indexing",
  };
}
export async function retrieveEvidence(
  symbol: string,
  docs: DocumentRecord[],
  passages: Evidence[],
  question: string,
  asOf: string,
  period?: string,
) {
  const corpus = permittedCorpus(symbol, docs, passages, asOf, period);
  const lexical = searchPassages(question, corpus, asOf);
  const config = embeddingConfig();
  const fallback = (reason: string, indexed = 0) => ({
    evidence: lexical,
    retrieval: {
      mode: "lexical" as const,
      reason,
      eligible: corpus.length,
      indexed,
      version: RETRIEVAL_VERSION,
    },
  });
  if (!config) return fallback("Semantic embeddings are not configured.");
  if (env.FINN_HYBRID_ENABLED !== "true")
    return fallback(
      "Hybrid search is available for evaluation; lexical remains the selected baseline.",
    );
  if (!corpus.length) return fallback("No date-eligible company evidence.");
  if (corpus.length > 2000)
    return fallback("Company corpus exceeds the bounded semantic index.");
  const id = configId(config);
  const vectors = new Map(
    (await vectorsFor(symbol))
      .filter((r) => r.config === id)
      .map((r) => [r.key, r.vector]),
  );
  const covered = corpus.filter((e) => vectors.has(evidenceKey(e))).length;
  if (covered !== corpus.length)
    return fallback(
      "Semantic indexing is incomplete; using the complete lexical corpus.",
      covered,
    );
  try {
    const queryId = await sha256(id + question);
    let query = await get<number[]>("query_embedding", queryId);
    if (!query) {
      if (!(await reserveEmbeddingBatch()))
        return fallback("Embedding budget exhausted.", covered);
      query = (await embedTexts(config, [embeddingInput(question)])).vectors[0];
      await put("query_embedding", queryId, query);
    }
    return {
      evidence: rankHybrid(question, corpus, query, vectors, asOf).hybrid,
      retrieval: {
        mode: "hybrid" as const,
        reason:
          "Lexical and semantic ranks fused; ranking is not factual confidence.",
        eligible: corpus.length,
        indexed: covered,
        model: config.model,
        version: RETRIEVAL_VERSION,
      },
    };
  } catch {
    return fallback(
      "Semantic provider unavailable or vectors incompatible.",
      covered,
    );
  }
}
