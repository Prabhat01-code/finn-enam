import type { Evidence } from "./domain";
import { withoutVerifiedDates } from "./claim-dates";

const expectation =
  /\b(?:expect|expects|expected|guidance|guided|forecast|target|plan|aim|anticipat)\w*\b/i;
const forecast = (text: string) =>
  expectation.test(text) &&
  !/consideration which.{0,40}expects to receive|revenue recogni/i.test(text);
const achievement =
  /\b(?:achieved|delivered|reported|recorded|stood|was|were|grew|declined)\b/i;
const down = /\b(?:declin\w*|fell|fall|decreas\w*|contract\w*|negative)\b/i;
const up = /\b(?:grew|grown|increas\w*|rose|positive)\b/i;
const metrics =
  /\b(?:revenue|sales|PAT|PBT|EBITDA|EBIT|net profit|profit after tax|profit before tax|operating margin|margin|capex|cash flow)\b/gi;
const metric = (s: string) =>
  s
    .toLowerCase()
    .replace(/sales/, "revenue")
    .replace(/profit after tax|net profit/, "pat")
    .replace(/profit before tax/, "pbt");
function bindings(text: string) {
  text = text
    .replace(/\bFY\s*['’]?\d{2,4}\b/gi, "")
    .replace(/\b[QH][1-4]\b/gi, "")
    .replace(/\b20\d{2}\b/g, "");
  const map = new Map<string, Set<string>>();
  for (const clause of text.split(/[;!?]|\band\b|\bbut\b|\.(?=\s)/i)) {
    const labels = [...clause.matchAll(metrics)];
    for (let i = 0; i < labels.length; i++) {
      const m = labels[i],
        end = labels[i + 1]?.index ?? clause.length;
      const nums =
        clause
          .slice(m.index! + m[0].length, end)
          .match(/\d+(?:,\d{3})*(?:\.\d+)?/g) ?? [];
      const key = metric(m[0]),
        values = map.get(key) ?? new Set<string>();
      nums.forEach((n) => values.add(String(Number(n.replace(/,/g, "")))));
      map.set(key, values);
    }
  }
  return map;
}
function unboundNumbers(text: string) {
  text = text
    .replace(/\bFY\s*['’]?\d{2,4}\b/gi, "")
    .replace(/\b20\d{2}\b/g, "")
    .replace(/\b[QH][1-4]\b/gi, "");
  const values = new Set<string>();
  for (const clause of text.split(/[;!?]|\band\b|\bbut\b|\.(?=\s)/i)) {
    const first = [...clause.matchAll(metrics)][0];
    const prefix = clause.slice(0, first?.index ?? clause.length);
    for (const n of prefix.match(/\d+(?:,\d{3})*(?:\.\d+)?/g) ?? [])
      values.add(String(Number(n.replace(/,/g, ""))));
  }
  return values;
}
// Conservative contradiction gates; semantic review is an additional independent step.
export function supportProblems(
  claim: string,
  citations: { quote: string; evidence: Evidence }[],
): string[] {
  claim = withoutVerifiedDates(
    claim,
    citations.map((c) => c.evidence),
  );
  const problems: string[] = [],
    quotes = citations.map((c) => c.quote).join(" ");
  if (citations.some((c) => c.evidence.metadataStatus === "conflict"))
    problems.push("source_metadata_conflict");
  if (
    citations.every(
      (c) =>
        c.evidence.speakerRole === "analyst" ||
        c.evidence.speakerRole === "moderator" ||
        /\bAnalyst\s*:|wanted to.{0,25}understand|can we (?:say|think)|\?/.test(
          c.quote,
        ),
    ) &&
    !/\b(?:analyst|question|participant asked)\b/i.test(claim)
  )
    problems.push("unverified_speaker");
  if (
    achievement.test(claim) &&
    !expectation.test(claim) &&
    forecast(quotes) &&
    !citations.some((c) => achievement.test(c.quote) && !forecast(c.quote))
  )
    problems.push("expectation_is_not_actual");
  if (up.test(claim) && down.test(quotes) && !up.test(quotes))
    problems.push("direction_conflict");
  if (down.test(claim) && up.test(quotes) && !down.test(quotes))
    problems.push("direction_conflict");
  const source = bindings(quotes);
  // A short statement like "guidance remains 1–4%" omits the metric name.
  // Its numbers cannot prove a contradictory binding; defer that ambiguity to
  // the support review instead of rejecting an otherwise supported comparison.
  const unbound = unboundNumbers(
    citations.map((c) => withoutVerifiedDates(c.quote, [c.evidence])).join(" "),
  );
  for (const [name, values] of bindings(claim)) {
    const supported = source.get(name);
    if (
      supported?.size &&
      [...values].some((n) => !supported.has(n) && !unbound.has(n))
    )
      problems.push("metric_value_mismatch");
  }
  if (
    /revenue|\bPAT\b|\bPBT\b|\bEBITDA\b|capex/i.test(claim) &&
    [...claim.matchAll(/\b\d[\d,]*(?:\.\d+)?\b/g)].some(
      (m) => Number(m[0].replace(/,/g, "")) >= 1000 && !/^20\d{2}$/.test(m[0]),
    ) &&
    !/crore|million|billion|\bINR\b|rupee|\bUSD\b|\$|₹|employees|accounts/i.test(
      claim,
    )
  )
    problems.push("missing_financial_unit");
  return [...new Set(problems)];
}
