import { searchPassages, type DocumentRecord, type Evidence } from "./domain";
import { eligibleEvidence, quarterKey } from "./question-plan";
export const RETRIEVAL_VERSION = "hybrid-rrf-v2-concepts";
export const evidenceKey = (e: Evidence) =>
  `${e.documentId}:${e.revision ?? "seed"}:${e.page}:${e.text}`;
export function permittedCorpus(
  symbol: string,
  docs: DocumentRecord[],
  passages: Evidence[],
  asOf: string,
  period?: string,
) {
  const allowed = new Map(
    docs
      .filter(
        (d) =>
          d.symbol === symbol &&
          d.status === "extracted" &&
          d.metadata?.status !== "conflict" &&
          ["annual_report", "transcript", "results", "filing"].includes(d.type),
      )
      .map((d) => [d.id, d]),
  );
  return passages.filter((e) => {
    const d = allowed.get(e.documentId);
    if (
      !d ||
      (d.revision && d.revision !== e.revision) ||
      !eligibleEvidence(e, asOf)
    )
      return false;
    if (!period) return true;
    const q = quarterKey(d.metadata?.periodEnd ?? "");
    if (/^Q/.test(period))
      return (
        q === period ||
        e.text.toUpperCase().replace(/\s+/g, " ").includes(period)
      );
    const fy = period.match(/^FY(\d{2})$/)?.[1];
    return (
      !!fy &&
      (q?.endsWith(period) ||
        new RegExp(`\\bFY\\s*['’]?(?:20)?${fy}\\b`, "i").test(e.text))
    );
  });
}
export function cosine(a: number[], b: number[]) {
  if (
    !a.length ||
    a.length !== b.length ||
    [...a, ...b].some((n) => !Number.isFinite(n))
  )
    throw new Error("Incompatible vectors");
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const norm = Math.sqrt(
    a.reduce((s, v) => s + v * v, 0) * b.reduce((s, v) => s + v * v, 0),
  );
  if (!norm) throw new Error("Zero vector");
  return dot / norm;
}
export function reciprocalRankFusion(lists: Evidence[][], limit = 12, k = 60) {
  if (!Number.isFinite(k) || k < 1) throw new Error("Invalid fusion constant");
  const scores = new Map<string, { evidence: Evidence; score: number }>();
  for (const list of lists) {
    const seen = new Set<string>();
    list.forEach((e, i) => {
      const key = evidenceKey(e);
      if (seen.has(key)) return;
      seen.add(key);
      const entry = scores.get(key) ?? { evidence: e, score: 0 };
      entry.score += 1 / (k + i + 1);
      scores.set(key, entry);
    });
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((e) => e.evidence);
}
export function rankHybrid(
  question: string,
  corpus: Evidence[],
  query: number[],
  vectors: Map<string, number[]>,
  asOf: string,
  limit = 12,
) {
  const lexical = searchPassages(question, corpus, asOf, 30);
  const semantic = corpus
    .map((e) => ({
      e,
      score: cosine(query, vectors.get(evidenceKey(e)) ?? []),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
    .map((r) => r.e);
  return {
    lexical: lexical.slice(0, limit),
    semantic: semantic.slice(0, limit),
    hybrid: reciprocalRankFusion([lexical, semantic], limit),
  };
}
