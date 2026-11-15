import test from "node:test";
import assert from "node:assert/strict";
import {
  cosine,
  permittedCorpus,
  reciprocalRankFusion,
} from "../lib/hybrid-search";
import { embedTexts } from "../lib/embedding-provider";
import type { Evidence, DocumentRecord } from "../lib/domain";
const e = (id: string, text = id): Evidence => ({
  documentId: id,
  text,
  title: id,
  page: 1,
  url: "https://example.com/" + id,
  publishedAt: "2026-01-01",
  type: "transcript",
});
const config = {
  baseUrl: "https://example.com/v1",
  apiKey: "synthetic",
  model: "test",
  version: "1",
};
test("retrieval filters other companies, future evidence and obsolete revisions before ranking", () => {
  const docs = [
    { id: "a", symbol: "INFY", type: "transcript", status: "extracted" },
    { id: "b", symbol: "OTHER", type: "transcript", status: "extracted" },
    { id: "future", symbol: "INFY", type: "transcript", status: "extracted" },
    {
      id: "old",
      symbol: "INFY",
      type: "transcript",
      status: "extracted",
      revision: "new",
    },
  ] as DocumentRecord[];
  assert.deepEqual(
    permittedCorpus(
      "INFY",
      docs,
      [
        e("a"),
        e("b"),
        { ...e("future"), publishedAt: "2027-01-01" },
        { ...e("old"), revision: "old" },
      ],
      "2026-11-15",
    ).map((p) => p.documentId),
    ["a"],
  );
});
test("rank fusion combines ranks and vector math rejects malformed or zero inputs", () => {
  assert.equal(
    reciprocalRankFusion(
      [
        [e("a"), e("b")],
        [e("b"), e("a")],
      ],
      2,
    ).length,
    2,
  );
  assert.equal(
    reciprocalRankFusion(
      [
        [e("a"), e("a")],
        [e("b"), e("a")],
      ],
      2,
    )[0].documentId,
    "a",
  );
  assert.equal(cosine([1, 0], [1, 0]), 1);
  for (const b of [[], [1], [0, 0], [NaN, 1]])
    assert.throws(() => cosine([1, 0], b));
});
test("embedding adapter validates count, indices and dimensions and never follows redirects", async () => {
  const valid = await embedTexts(config, ["one", "two"], async (_url, init) => {
    assert.equal(init?.redirect, "error");
    return Response.json({
      data: [
        { index: 1, embedding: [0, 1] },
        { index: 0, embedding: [1, 0] },
      ],
    });
  });
  assert.deepEqual(valid.vectors[0], [1, 0]);
  for (const data of [
    [],
    [{ index: 1, embedding: [1] }],
    [{ index: 0, embedding: [0, 0] }],
    [{ index: 0, embedding: [null, 1] }],
  ])
    await assert.rejects(
      embedTexts(config, ["one"], async () => Response.json({ data })),
    );
});
