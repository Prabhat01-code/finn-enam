export type EmbeddingConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  version: string;
};
export function embeddingInput(text: string) {
  return text.slice(0, 1600);
}
export async function embedTexts(
  config: EmbeddingConfig,
  texts: string[],
  fetcher: typeof fetch = fetch,
) {
  const base = new URL(config.baseUrl);
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error(
      "Embedding endpoint must be a configured HTTPS origin/path",
    );
  if (!texts.length || texts.length > 16 || texts.some((s) => s.length > 1600))
    throw new Error("Embedding batch exceeds bounds");
  const response = await fetcher(
    config.baseUrl.replace(/\/$/, "") + "/embeddings",
    {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        input: texts,
        encoding_format: "float",
      }),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok)
    throw new Error(`Embedding provider HTTP ${response.status}`);
  const body = (await response.json()) as {
    data?: { index: number; embedding: number[] }[];
    usage?: { total_tokens?: number };
  };
  if (!Array.isArray(body.data) || body.data.length !== texts.length)
    throw new Error("Incomplete embedding response");
  const rows = body.data.sort((a, b) => a.index - b.index);
  const size = rows[0]?.embedding?.length;
  if (
    !size ||
    size > 4096 ||
    rows.some(
      (r, i) =>
        r.index !== i ||
        !Array.isArray(r.embedding) ||
        r.embedding.length !== size ||
        r.embedding.some((n) => typeof n !== "number" || !Number.isFinite(n)) ||
        !r.embedding.some((n) => n !== 0),
    )
  )
    throw new Error("Malformed embedding response");
  return {
    vectors: rows.map((r) => r.embedding),
    tokens: body.usage?.total_tokens ?? null,
  };
}
