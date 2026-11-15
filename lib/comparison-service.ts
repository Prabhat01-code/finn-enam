import { documents, passages, research, resolveCompany } from "./services";
import { modelStatus, synthesizeEvidence } from "./answer-service";
import { reviewedComparison } from "./reviewed-comparison";
import {
  COMPARISON_VERSION,
  comparisonQuestion,
  selectCallContext,
  validateComparison,
  type ComparisonFocus,
} from "./call-comparison";

export async function callContext(
  symbol: string,
  asOf?: string,
  focus: ComparisonFocus = "guidance",
  earlierId?: string,
  laterId?: string,
) {
  const company = resolveCompany(symbol);
  const at = asOf ?? new Date().toISOString();
  const context = selectCallContext(
    await documents(company.symbol),
    await passages(company.symbol),
    at,
    focus,
    earlierId,
    laterId,
  );
  return {
    ...context,
    company,
    asOf: at,
    model: modelStatus(),
    reviewedAvailable: !!reviewedComparison(context),
  };
}

export async function compareCalls(
  user: string,
  symbol: string,
  asOf?: string,
  focus: ComparisonFocus = "guidance",
  earlierId?: string,
  laterId?: string,
) {
  const context = await callContext(symbol, asOf, focus, earlierId, laterId);
  const pair = context.pair;
  const reviewed = reviewedComparison(context);
  if (reviewed)
    return {
      ...context,
      synthesis: reviewed,
      modelError: null,
      method: "source_reviewed",
    };
  if (
    !pair ||
    [pair.earlier, pair.later].some(
      (c) => !context.evidence.some((p) => p.documentId === c.id),
    )
  )
    return {
      ...context,
      synthesis: null,
      modelError: {
        code: "comparison_coverage",
        message:
          "Both calls need dated, relevant source evidence before a comparison can be generated.",
      },
    };
  const question = comparisonQuestion(pair, focus);
  const base = {
    ...(await research(symbol, question, context.asOf)),
    evidence: context.evidence,
  };
  const answer = await synthesizeEvidence(
    user,
    base,
    question,
    COMPARISON_VERSION,
    (s) => validateComparison(s, pair),
    `CALL-COMPARISON MODE: Compare one metric or theme per claim, citing both the ${pair.earlier.date} and ${pair.later.date} calls in that same claim. Include an earlier source quote and a later source quote; each must independently establish its own side. Use 2 or 3 claims. Report explicit reaffirmations as well as changes. If annual guidance ranges include different acquisition assumptions, say they are not like-for-like. Do not calculate deltas. Omit fiscal years unless the quotes explicitly establish them. Never split a comparison into one-sided claims. Do not infer new or disappeared risks from the retrieved selection.`,
    true,
  );
  return {
    ...context,
    synthesis: answer.synthesis,
    modelError: answer.modelError,
    method: "model_generated",
  };
}
