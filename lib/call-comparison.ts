import { searchPassages, type DocumentRecord, type Evidence } from "./domain";
import type { Synthesis } from "./model";

export const COMPARISON_VERSION = "calls-v3-context-bindings";
export const COMPARISON_FOCUS = {
  guidance: {
    label: "Guidance & margins",
    query: "revenue growth guidance outlook operating margin",
  },
  demand: {
    label: "Demand & risks",
    query: "demand client uncertainty risk pricing outlook",
  },
  investment: {
    label: "Capacity & investment",
    query: "capex capacity expansion investment commissioning",
  },
} as const;
export type ComparisonFocus = keyof typeof COMPARISON_FOCUS;
export type DatedCall = {
  id: string;
  title: string;
  date: string;
  url: string;
  publishedAt: string | null;
  passages: number;
};
export type CallPair = { earlier: DatedCall; later: DatedCall };
export type ComparisonContext = {
  calls: DatedCall[];
  pair: CallPair | null;
  focus: ComparisonFocus;
  gaps: string[];
  evidence: Evidence[];
};

export function selectCallContext(
  documents: DocumentRecord[],
  passages: Evidence[],
  asOf: string,
  focus: ComparisonFocus = "guidance",
  earlierId?: string,
  laterId?: string,
): ComparisonContext {
  const at = Date.parse(asOf);
  const eligible = (p: Evidence) => {
    const time = Date.parse(p.publishedAt ?? p.availableAt ?? "");
    return (
      Number.isFinite(time) && time <= at && p.metadataStatus !== "conflict"
    );
  };
  const calls = documents
    .filter(
      (d) =>
        d.type === "transcript" &&
        d.status === "extracted" &&
        d.metadata?.status === "verified" &&
        d.metadata.callDate &&
        Date.parse(d.metadata.callDate) <= at &&
        Date.parse(d.publishedAt ?? d.fetchedAt) <= at,
    )
    .map((d) => ({
      id: d.id,
      title: d.title,
      date: d.metadata!.callDate!,
      url: d.url,
      publishedAt: d.publishedAt,
      passages: passages.filter((p) => p.documentId === d.id && eligible(p))
        .length,
    }))
    .filter((d) => d.passages > 0)
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.passages - a.passages ||
        a.id.localeCompare(b.id),
    );
  // A PDF mirror/duplicate on the same call day must not become the previous call.
  const unique = calls.filter(
    (d, i) => calls.findIndex((x) => x.date === d.date) === i,
  );
  if (!!earlierId !== !!laterId)
    throw new Error("Choose both calls to compare.");
  const later = laterId ? unique.find((d) => d.id === laterId) : unique[0];
  const earlier = earlierId
    ? unique.find((d) => d.id === earlierId)
    : unique[1];
  if (
    (earlierId || laterId) &&
    (!earlier || !later || earlier.date >= later.date)
  )
    throw new Error("Choose two available calls with the earlier date first.");
  const gaps = [
    "This compares indexed excerpts, not an exhaustive call history. An omitted topic does not prove it is new or resolved.",
  ];
  const pair = earlier && later ? { earlier, later } : null;
  if (!pair)
    gaps.push(
      "Two extracted transcripts with verified, distinct call dates and date-eligible passages are required. Discover documents or review source dates.",
    );
  if (
    documents.some(
      (d) =>
        d.type === "transcript" &&
        (!d.metadata?.callDate || d.metadata.status !== "verified"),
    )
  )
    gaps.push(
      "Some transcripts have unresolved call dates and are excluded; the selected calls may not be consecutive.",
    );
  if (pair && (!pair.earlier.publishedAt || !pair.later.publishedAt))
    gaps.push(
      "Call dates are verified. Exchange publication times are not verified for both PDFs; unknown dates use first retrieval time for historical eligibility.",
    );
  const evidence = pair
    ? [pair.earlier, pair.later].flatMap((call) =>
        searchPassages(
          COMPARISON_FOCUS[focus].query,
          passages.filter(
            (p) => p.documentId === call.id && p.speakerRole === "management",
          ),
          asOf,
          8,
        ).map((p) => ({ ...p, sourceDate: call.date })),
      )
    : [];
  if (
    pair &&
    [pair.earlier, pair.later].some(
      (d) => !evidence.some((p) => p.documentId === d.id),
    )
  )
    gaps.push(
      "Matching management context is missing from one of the calls for this topic. No comparison can be generated.",
    );
  return { calls: unique, pair, focus, gaps, evidence };
}

export function comparisonQuestion(pair: CallPair, focus: ComparisonFocus) {
  return `Compare ${COMPARISON_FOCUS[focus].label.toLowerCase()} between the earlier call (${pair.earlier.date}) and later call (${pair.later.date}). Each claim MUST describe one comparison and cite supporting excerpts from BOTH calls, with earlier and later attribution. Include supported changes AND explicit reaffirmations. Preserve target year, currency, scope and units; quarterly and cumulative values differ. If acquisitions or reporting basis change, explain why the figures are not like-for-like instead of calling it an upgrade. Do not infer a new risk, disappearance or first mention from missing excerpts. Do not describe guidance as achieved. No arithmetic. Prefer 2-3 focused comparisons; abstain if neither call pair supports a comparison.`;
}

export function validateComparison(
  answer: Synthesis,
  pair: CallPair,
): Synthesis {
  const reasons: string[] = [];
  const claims = answer.claims.filter((c) => {
    if (c.citations.some((x) => x.evidence.speakerRole !== "management")) {
      reasons.push("comparison_requires_management_context");
      return false;
    }
    if (
      /one.sided|do(?:es)? not contain|not (?:present|stated|mentioned)|no.{0,30}comparable.{0,20}statement/i.test(
        c.text,
      )
    ) {
      reasons.push("missing_counterpart_is_not_comparison");
      return false;
    }
    if (
      /revenue.{0,20}(?:guidance|growth)/i.test(c.text) &&
      /\bmargin\b/i.test(c.text)
    ) {
      reasons.push("comparison_one_metric_per_claim");
      return false;
    }
    const ids = new Set(c.citations.map((x) => x.evidence.documentId));
    if (
      ids.size !== 2 ||
      !ids.has(pair.earlier.id) ||
      !ids.has(pair.later.id)
    ) {
      reasons.push("comparison_requires_both_calls");
      return false;
    }
    if (
      /\b(?:new(?:ly)? (?:risk|concern|headwind)|first (?:mention|time)|no longer|disappeared|risk.{0,25}resolved)\b/i.test(
        c.text,
      )
    ) {
      reasons.push("absence_is_not_change");
      return false;
    }
    const quotes = c.citations.map((x) => x.quote).join(" ");
    if (
      /exclud\w*.{0,25}acquisition|organic basis/i.test(quotes) &&
      /includ\w*.{0,25}acquisition|inorganic contribution/i.test(quotes) &&
      !/not.{0,15}compar|basis|scope|including acquisitions|includes acquisitions/i.test(
        c.text,
      )
    ) {
      reasons.push("comparison_basis_change");
      return false;
    }
    return true;
  });
  const withheld = answer.claims.length - claims.length;
  return {
    ...answer,
    claims,
    status: claims.length ? "answered" : "insufficient_evidence",
    gaps: [
      ...answer.gaps,
      ...(withheld
        ? [
            "Comparisons without support from both calls, or with uncertain changes, were withheld.",
          ]
        : []),
    ],
    validation: {
      ...answer.validation,
      acceptedClaims: claims.length,
      rejectedClaims: answer.validation.rejectedClaims + withheld,
      rejectionReasons: [
        ...new Set([...answer.validation.rejectionReasons, ...reasons]),
      ],
    },
  };
}
