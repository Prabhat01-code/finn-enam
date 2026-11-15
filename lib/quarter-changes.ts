import type { DocumentRecord, Evidence } from "./domain";
import type { FinancialResults } from "./financials";
import {
  eligibleEvidence,
  quarterKey,
  numericalAnswer,
  planQuestion,
  selectResults,
} from "./question-plan";
import reviews from "../data/call-comparison-review.json";

export type QuarterChange = {
  kind: "financial" | "commentary";
  title: string;
  before: string;
  after: string;
  difference: string;
  relevance: string;
  evidence: Evidence[];
  question: string;
};
export type QuarterChanges = {
  version: string;
  symbol: string;
  asOf: string;
  period: string | null;
  previousPeriod: string | null;
  status: "supported" | "numbers_only" | "insufficient_evidence";
  basis: string | null;
  items: QuarterChange[];
  gaps: string[];
};
const number = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
export function quarterChanges(
  symbol: string,
  tables: FinancialResults[],
  docs: DocumentRecord[],
  asOf: string,
  period?: string,
): QuarterChanges {
  const r = selectResults(tables, asOf, period);
  const result: QuarterChanges = {
    version: "quarter-changes-v1",
    symbol,
    asOf,
    period: r?.period ?? null,
    previousPeriod: r?.previousLabel ?? null,
    status: "insufficient_evidence",
    basis: r ? `${r.scope} · ${r.currency} ${r.unit} · ${r.basis}` : null,
    items: [],
    gaps: [],
  };
  if (!r) {
    result.gaps.push(
      "No date-eligible comparable quarterly financial table is verified. A call comparison alone is not a financial quarter-change card.",
    );
    return result;
  }
  for (const metric of ["Revenue", "EBITDA", "PAT", "PBT"]) {
    if (result.items.length >= 3) break;
    const plan = planQuestion(symbol, `What was ${metric} growth?`, asOf);
    plan.period = quarterKey(r.currentLabel) ?? quarterKey(r.period);
    const answer = numericalAnswer(plan, [r]);
    const qoq = answer.calculations.find((c) => c.label.endsWith("QOQ"));
    const yoy = answer.calculations.find((c) => c.label.endsWith("YOY"));
    if (!qoq || qoq.previous === undefined) continue;
    result.items.push({
      kind: "financial",
      title: metric,
      before: `${number(qoq.previous)} ${r.currency} ${r.unit}`,
      after: `${number(qoq.current)} ${r.currency} ${r.unit}`,
      difference: `${qoq.value == null ? "QoQ percentage unavailable" : `${number(qoq.value)}% QoQ`}${yoy?.value != null ? ` · ${number(yoy.value)}% YoY` : ""}`,
      relevance: `Compares ${r.currentLabel} with ${r.previousLabel}${yoy ? ` and ${r.yearAgoLabel}` : ""}. Year-on-year context helps distinguish seasonal variation.`,
      evidence: r.evidence,
      question: `What was ${metric} growth in ${plan.period}?`,
    });
  }
  const mp = planQuestion(symbol, "What was EBITDA margin change QoQ?", asOf);
  mp.period = quarterKey(r.currentLabel) ?? quarterKey(r.period);
  const margin = numericalAnswer(mp, [r]).calculations[0];
  if (margin?.value != null && margin.previous != null)
    result.items.push({
      kind: "financial",
      title: "EBITDA margin",
      before: `${number(margin.previous)}%`,
      after: `${number(margin.current)}%`,
      difference: `${number(margin.value)} percentage points · ${number(margin.value * 100)} bps`,
      relevance:
        "EBITDA divided by revenue in each quarter. This measures reported profitability; it does not establish a cause.",
      evidence: margin.evidence,
      question: `Why did EBITDA margin change in ${mp.period} QoQ?`,
    });
  for (const o of reviews.observations) {
    if (result.items.length >= 5) break;
    const before = docs.find((d) => d.id === o.beforeEvidence.documentId);
    const after = docs.find((d) => d.id === o.afterEvidence.documentId);
    if (
      !before ||
      !after ||
      before.symbol !== symbol ||
      after.symbol !== symbol ||
      before.status !== "extracted" ||
      after.status !== "extracted" ||
      before.metadata?.status !== "verified" ||
      after.metadata?.status !== "verified" ||
      before.metadata.callDate !== o.beforeEvidence.callDate ||
      after.metadata.callDate !== o.afterEvidence.callDate ||
      quarterKey(before.metadata.periodEnd ?? "") !==
        quarterKey(r.previousLabel) ||
      quarterKey(after.metadata.periodEnd ?? "") !== quarterKey(r.currentLabel)
    )
      continue;
    const evidence: Evidence[] = [o.beforeEvidence, o.afterEvidence].map(
      (e, i) => {
        const d = i === 0 ? before : after;
        return {
          documentId: d.id,
          title: d.title,
          url: d.url,
          page: e.page,
          text: e.quote,
          publishedAt: d.publishedAt,
          availableAt: d.fetchedAt,
          type: "transcript",
          speaker: e.speaker,
          speakerRole: "management",
          metadataStatus: "verified",
          sourceDate: e.callDate,
          verbatim: true,
        };
      },
    );
    if (!evidence.every((e) => eligibleEvidence(e, asOf))) continue;
    result.items.push({
      kind: "commentary",
      title: o.topic,
      before: o.before,
      after: o.after,
      difference: "Source-reviewed management statements",
      relevance: o.interpretation,
      evidence,
      question: `What did management say about ${o.topic} in ${quarterKey(r.currentLabel)}?`,
    });
  }
  result.status = !result.items.length
    ? "insufficient_evidence"
    : result.items.some((i) => i.kind === "commentary")
      ? "supported"
      : "numbers_only";
  if (result.status === "numbers_only")
    result.gaps.push(
      "Numbers-only card: a reviewed narrative comparison for these exact quarters is not available. Management commentary is pending.",
    );
  result.gaps.push(
    "Selected supported changes, not a complete account of the quarter. Missing discussion does not mean an earlier risk has disappeared.",
  );
  return result;
}
