import type { Evidence } from "./domain";
import type { Synthesis } from "./model";

export type QualityExpectation = {
  mode: "answer" | "abstain" | "no_evidence" | "coverage_gap";
  required?: string[];
  forbidden?: string[];
  sources?: { documentId: string; page?: number }[];
  paired?: boolean;
};
export function assessQuality(
  body: {
    synthesis?: Synthesis | null;
    modelError?: { code: string } | null;
    evidence?: Evidence[];
    pair?: { earlier: { id: string }; later: { id: string } } | null;
  },
  expected: QualityExpectation,
  asOf?: string,
) {
  const synthesis = body.synthesis;
  const claims = synthesis?.claims ?? [];
  const text = claims.map((c) => c.text).join(" ");
  const citations = claims.flatMap((c) => c.citations);
  const checks: Record<string, boolean> = {
    expectedOutcome:
      expected.mode === "answer"
        ? synthesis?.status === "answered" &&
          claims.length > 0 &&
          !body.modelError
        : expected.mode === "abstain"
          ? synthesis?.status === "insufficient_evidence" &&
            claims.length === 0 &&
            !body.modelError
          : expected.mode === "no_evidence"
            ? body.modelError?.code === "no_evidence" && !synthesis
            : body.modelError?.code === "comparison_coverage" && !synthesis,
    noUncitedClaims: claims.every((c) => c.citations.length > 0),
    exactQuotes: citations.every((c) =>
      c.evidence.text
        .replace(/\s+/g, " ")
        .includes(c.quote.replace(/\s+/g, " ")),
    ),
    dateEligibility:
      !asOf ||
      (body.evidence ?? []).every(
        (p) =>
          Date.parse(p.publishedAt ?? p.availableAt ?? "") <= Date.parse(asOf),
      ),
    noAnalystAsManagement: !claims.some(
      (c) =>
        /management|guidance|guided/i.test(c.text) &&
        c.citations.every(
          (x) =>
            x.evidence.speakerRole === "analyst" ||
            x.evidence.speakerRole === "moderator",
        ),
    ),
  };
  for (const [i, pattern] of (expected.required ?? []).entries())
    checks[`requiredFact${i + 1}`] = new RegExp(pattern, "i").test(text);
  for (const [i, pattern] of (expected.forbidden ?? []).entries())
    checks[`forbiddenClaim${i + 1}`] = !new RegExp(pattern, "i").test(text);
  for (const [i, source] of (expected.sources ?? []).entries())
    checks[`expectedSource${i + 1}`] = citations.some(
      (c) =>
        c.evidence.documentId === source.documentId &&
        (!source.page || c.evidence.page === source.page),
    );
  if (expected.paired)
    checks.bothCalls =
      !!body.pair &&
      claims.every((c) =>
        [body.pair!.earlier.id, body.pair!.later.id].every((id) =>
          c.citations.some((x) => x.evidence.documentId === id),
        ),
      );
  return { checks, passed: Object.values(checks).every(Boolean) };
}
