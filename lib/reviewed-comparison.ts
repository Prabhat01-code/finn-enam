import reviews from "../data/call-comparison-review.json";
import type { ComparisonContext } from "./call-comparison";
import type { Synthesis } from "./model";
import type { Evidence } from "./domain";

/** Fixed source hashes + verified call dates select human-reviewed observations.
 * This path is explicitly labelled and never represented as a live model answer.
 */
export function reviewedComparison(
  context: ComparisonContext,
): Synthesis | null {
  const pair = context.pair;
  if (!pair || context.focus !== "guidance") return null;
  const observations = reviews.observations.filter(
    (o) =>
      o.beforeEvidence.documentId === pair.earlier.id &&
      o.afterEvidence.documentId === pair.later.id &&
      o.beforeEvidence.callDate === pair.earlier.date &&
      o.afterEvidence.callDate === pair.later.date,
  );
  if (!observations.length) return null;
  const claims = observations.map((o) => ({
    text: `${o.topic}: ${o.before} → ${o.after}. ${o.interpretation}`,
    kind: "inference" as const,
    citations: [o.beforeEvidence, o.afterEvidence].map((source, i) => {
      const call = i === 0 ? pair.earlier : pair.later;
      const evidence: Evidence = {
        documentId: call.id,
        title: call.title,
        url: call.url,
        page: source.page,
        text: source.quote,
        publishedAt: call.publishedAt,
        type: "transcript",
        sourceDate: call.date,
        speaker: source.speaker,
        speakerRole: "management",
        metadataStatus: "verified",
        verbatim: true,
      };
      return { sourceId: `S${i + 1}`, quote: source.quote, evidence };
    }),
  }));
  return {
    status: "answered",
    claims,
    gaps: [
      "These selected observations were reviewed against the original PDF pages; they do not cover every change discussed in either call.",
    ],
    provider: "Primary-source review",
    model: "Source-reviewed comparison",
    generatedAt: reviews.reviewedAt,
    cached: false,
    validation: {
      acceptedClaims: claims.length,
      rejectedClaims: 0,
      rejectionReasons: [],
      quoteChecks: true,
      note: "Manually reviewed primary-source quotes, call dates, periods and bases. Matched to the indexed PDF content identifiers. No model call is used for this reviewed pair.",
    },
    usage: { requests: 0, inputTokens: 0, outputTokens: 0, durationMs: 0 },
  };
}
