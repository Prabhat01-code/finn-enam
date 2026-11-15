import type { Evidence } from "./domain";
import type { FinancialResults, Guidance } from "./financials";

export const PLAN_VERSION = "typed-research-v1";
export type QuestionPlan = {
  version: string;
  company: string;
  intent: "numerical" | "explanation" | "guidance" | "narrative";
  metric?: string;
  period?: string;
  comparison: "qoq" | "yoy" | "both";
  operation: "value" | "growth" | "margin";
  asOf: string;
  constraints: string[];
  expectsDecline: boolean;
};
export type Calculation = {
  label: string;
  current: number;
  previous?: number;
  value: number | null;
  unit: string;
  formula: string;
  period: string;
  comparisonPeriod?: string;
  evidence: Evidence[];
};
export type StructuredAnswer = {
  status: "answered" | "partial" | "insufficient_evidence";
  heading: string;
  basis?: string;
  calculations: Calculation[];
  evidence: Evidence[];
  gaps: string[];
  guidance?: {
    metric: string;
    period: string;
    target: string;
    actual: number | null;
    outcome: string;
    statementDate: string;
    note: string;
  };
  premise?: "confirmed" | "contradicted" | "unverified";
};

// Fiscal-year labels in this NSE corpus use an April–March reporting year.
export function quarterKey(label: string): string | undefined {
  const q = label.match(/Q([1-4])\s*FY\s*(?:20)?(\d{2})/i);
  if (q) return `Q${q[1]} FY${q[2]}`;
  const iso = label.match(/(20\d{2})-(\d{2})-\d{2}/);
  const month = label.match(/\b(MAR|JUN|SEP|DEC)\w*\s+(20\d{2})/i);
  const year = Number(iso?.[1] ?? month?.[2]);
  const m = iso
    ? Number(iso[2])
    : month
      ? { MAR: 3, JUN: 6, SEP: 9, DEC: 12 }[month[1].toUpperCase() as "MAR"]
      : 0;
  if (!year || ![3, 6, 9, 12].includes(m)) return;
  return `Q${m === 3 ? 4 : m / 3 - 1} FY${String(year + (m === 3 ? 0 : 1)).slice(2)}`;
}
export function quarterOrder(label: string) {
  const q = quarterKey(label)?.match(/Q(\d) FY(\d+)/);
  return q ? Number(q[2]) * 4 + Number(q[1]) : -1;
}
export function eligibleEvidence(e: Evidence, asOf: string) {
  const when = e.publishedAt ?? e.availableAt;
  return (
    e.metadataStatus !== "conflict" &&
    !!when &&
    Number.isFinite(Date.parse(when)) &&
    Date.parse(when) <= Date.parse(asOf)
  );
}
export function planQuestion(
  company: string,
  question: string,
  asOf: string,
): QuestionPlan {
  const guidance =
    /\bguidance\b|\b(?:meet|met|miss|missed|deliver(?:ed)?)\b.{0,25}\b(?:target|promise|outlook)/i.test(
      question,
    );
  const explanation = /\bwhy\b|\bdrivers?\b|\bexplain\b|\bcaus(?:e|ed)\b/i.test(
    question,
  );
  const numerical =
    /\bhow much\b|\bwhat (?:was|is|were)\b|\bcalculate\b|\bgrowth\b|\bmargin\b|\bchange\b/i.test(
      question,
    );
  const margin = /\bmargin/i.test(question);
  const metric = /\bebitda\b/i.test(question)
    ? "EBITDA"
    : /\b(?:ebit|operating (?:profit|margin))\b/i.test(question)
      ? "EBIT"
      : /\bpbt\b|profit before tax/i.test(question)
        ? "PBT"
        : /\bpat\b|net (?:profit|margin)|profit after tax/i.test(question)
          ? "PAT"
          : /\brevenue\b|\bsales\b/i.test(question)
            ? "Revenue"
            : /\bcapex\b|capital expenditure/i.test(question)
              ? "Capital expenditure"
              : undefined;
  const q = question.match(/Q([1-4])\s*(?:FY\s*)?(?:20)?(\d{2})\b/i);
  const fy = question.match(/\bFY\s*['’]?(?:20)?(\d{2})\b/i);
  const period = q ? `Q${q[1]} FY${q[2]}` : fy ? `FY${fy[1]}` : undefined;
  const constraints: string[] = [];
  if (/\bstandalone\b/i.test(question)) constraints.push("standalone");
  if (/constant.currency/i.test(question)) constraints.push("currency_basis");
  if (/\bUSD\b|\bdollars?\b/i.test(question)) constraints.push("usd_basis");
  if (/\bsegment\b|\bdivision\b|\bFMEG\b|\bservices business\b/i.test(question))
    constraints.push("segment");
  if (/\bH[12]\b|\b9M\b|\bYTD\b|half.year|year.to.date/i.test(question))
    constraints.push("non_quarter");
  if ((question.match(/Q[1-4]\s*(?:FY\s*)?(?:20)?\d{2}\b/gi) ?? []).length > 1)
    constraints.push("multiple_periods");
  if (
    /\b20\d{2}\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(
      question,
    ) &&
    !period
  )
    constraints.push("unresolved_period");
  const metricsMentioned = [
    /\brevenue\b|\bsales\b/i,
    /\bebitda\b/i,
    /\b(?:ebit|operating (?:profit|margin))\b/i,
    /\bpbt\b|profit before tax/i,
    /\bpat\b|net (?:profit|margin)|profit after tax/i,
  ].filter((re) => re.test(question));
  if (!margin && metricsMentioned.length > 1)
    constraints.push("multiple_metrics");
  return {
    version: PLAN_VERSION,
    company,
    asOf,
    period,
    metric,
    intent: guidance
      ? "guidance"
      : explanation
        ? "explanation"
        : numerical &&
            (metric ||
              margin ||
              /\bdebt\b|cash flow|\beps\b|working capital/i.test(question))
          ? "numerical"
          : "narrative",
    comparison: /\byoy\b|year.over.year|year.on.year/i.test(question)
      ? "yoy"
      : /\bqoq\b|quarter.over.quarter|last quarter|previous quarter/i.test(
            question,
          )
        ? "qoq"
        : "both",
    operation: margin
      ? "margin"
      : /\bgrowth\b|\bgrew\b|\bchange\b|\bfall\b|\bfell\b|\bdeclin|\bincreas/i.test(
            question,
          )
        ? "growth"
        : "value",
    constraints,
    expectsDecline:
      /\bfall\b|\bfell\b|\bdeclin|\bcompress|\bcontract|\bdrop/i.test(question),
  };
}
export function selectResults(
  tables: FinancialResults[],
  asOf: string,
  period?: string,
) {
  return (
    tables
      .filter(
        (r) =>
          r.evidence.length > 0 &&
          r.evidence.every((e) => eligibleEvidence(e, asOf)) &&
          (!period ||
            quarterKey(r.period) === period ||
            quarterKey(r.currentLabel) === period),
      )
      .sort(
        (a, b) =>
          quarterOrder(b.period || b.currentLabel) -
            quarterOrder(a.period || a.currentLabel) ||
          Date.parse(b.evidence[0].publishedAt ?? b.evidence[0].availableAt!) -
            Date.parse(a.evidence[0].publishedAt ?? a.evidence[0].availableAt!),
      )[0] ?? null
  );
}
export function numericalAnswer(
  plan: QuestionPlan,
  tables: FinancialResults[],
): StructuredAnswer {
  const answer: StructuredAnswer = {
    status: "insufficient_evidence",
    heading: "Verified financial calculation",
    calculations: [],
    evidence: [],
    gaps: [],
  };
  if (plan.constraints.length) {
    answer.gaps.push(
      "The requested period, reporting basis or segment is not resolved to a comparable fact set. Specify a single fiscal quarter and consolidated reported figures.",
    );
    return answer;
  }
  if (
    !plan.metric ||
    (plan.operation === "margin" &&
      !["EBITDA", "EBIT", "PAT", "PBT"].includes(plan.metric))
  ) {
    answer.gaps.push(
      plan.operation === "margin"
        ? "Specify the metric: EBITDA margin, operating margin or net profit margin. These are different measures."
        : "No validated structured fact is available for this metric. Supported quarterly measures are revenue, EBITDA, PBT and PAT where reported.",
    );
    return answer;
  }
  const r = selectResults(tables, plan.asOf, plan.period);
  if (!r) {
    answer.gaps.push(
      `No date-eligible verified quarterly table${plan.period ? ` for ${plan.period}` : ""} is available. Annual or future figures have not been substituted.`,
    );
    return answer;
  }
  answer.basis = `${r.period} · ${r.scope} · ${r.currency} ${r.unit} · ${r.basis}`;
  const m = r.metrics.find((m) => m.name === plan.metric);
  const revenue = r.metrics.find((m) => m.name === "Revenue");
  if (!m || m.current === null || !Number.isFinite(m.current)) {
    answer.gaps.push(
      `${plan.metric} is unavailable in this verified table. A different profit measure has not been substituted.`,
    );
    return answer;
  }
  const margin = plan.operation === "margin";
  const val = (slot: "current" | "previous" | "yearAgo") => {
    const n = m[slot],
      d = revenue?.[slot];
    if (n === null || !Number.isFinite(n)) return null;
    return margin
      ? d != null && d > 0 && Number.isFinite(d)
        ? (n / d) * 100
        : null
      : n;
  };
  const current = val("current");
  if (current === null) {
    answer.gaps.push(
      "A positive comparable revenue denominator is needed for the margin.",
    );
    return answer;
  }
  answer.evidence = r.evidence;
  if (plan.operation === "value") {
    answer.calculations.push({
      label: plan.metric,
      current,
      value: current,
      unit: `${r.currency} ${r.unit}`,
      formula: "Reported value; no calculation",
      period: r.currentLabel,
      evidence: r.evidence,
    });
  } else {
    for (const kind of plan.comparison === "both"
      ? ["qoq", "yoy"]
      : [plan.comparison]) {
      const slot = kind === "qoq" ? "previous" : "yearAgo",
        label = kind === "qoq" ? r.previousLabel : r.yearAgoLabel;
      const previous = val(slot);
      const distance = quarterOrder(r.currentLabel) - quarterOrder(label);
      if (previous === null || distance !== (kind === "qoq" ? 1 : 4)) {
        answer.gaps.push(
          `No comparable ${kind.toUpperCase()} ${plan.metric} observation.`,
        );
        continue;
      }
      const value = margin
        ? current - previous
        : previous > 0
          ? ((current - previous) / previous) * 100
          : null;
      answer.calculations.push({
        label: `${plan.metric}${margin ? " margin" : " growth"} · ${kind.toUpperCase()}`,
        current,
        previous,
        value,
        unit: margin ? "percentage points" : "%",
        formula: margin
          ? `(${m.current} / ${revenue!.current} × 100) − (${m[slot]} / ${revenue![slot]} × 100)`
          : `(${current} − ${previous}) / ${previous} × 100`,
        period: r.currentLabel,
        comparisonPeriod: label,
        evidence: r.evidence,
      });
      if (value === null)
        answer.gaps.push(
          `${kind.toUpperCase()} percentage growth is not meaningful with a zero or negative base; inspect the input values.`,
        );
    }
  }
  if (plan.expectsDecline) {
    const c = answer.calculations.filter((c) => c.value !== null);
    answer.premise = !c.length
      ? "unverified"
      : c.every((c) => c.value! < 0)
        ? "confirmed"
        : "contradicted";
    if (answer.premise === "contradicted")
      answer.gaps.push(
        "The requested decline is not established for every selected comparison. Inspect QoQ and YoY separately before attributing a cause.",
      );
  }
  answer.status = answer.calculations.length
    ? answer.gaps.length
      ? "partial"
      : "answered"
    : "insufficient_evidence";
  return answer;
}
export function guidanceAnswer(
  plan: QuestionPlan,
  records: Guidance[],
): StructuredAnswer {
  const answer: StructuredAnswer = {
    status: "insufficient_evidence",
    heading: "Management target and actual",
    calculations: [],
    evidence: [],
    gaps: [],
  };
  const candidates = records.filter(
    (g) =>
      eligibleEvidence(g.targetEvidence, plan.asOf) &&
      g.statementDate <= plan.asOf.slice(0, 10) &&
      (!plan.period || g.period === plan.period) &&
      (!plan.metric ||
        g.metric.toLowerCase().includes(plan.metric.toLowerCase())) &&
      (!plan.constraints.includes("currency_basis") ||
        /constant.currency/i.test(g.basis)),
  );
  const g = candidates.sort(
    (a, b) =>
      b.periodEnd.localeCompare(a.periodEnd) ||
      b.statementDate.localeCompare(a.statementDate),
  )[0];
  if (!g || plan.constraints.some((c) => c !== "currency_basis")) {
    answer.gaps.push(
      "No dated, comparable management target is verified for the requested metric, period and basis. A missing target is not a missed target.",
    );
    return answer;
  }
  const actualAvailable =
    g.actual !== null &&
    !!g.actualEvidence &&
    eligibleEvidence(g.actualEvidence, plan.asOf) &&
    plan.asOf.slice(0, 10) >= g.periodEnd &&
    (!g.actualStatementDate || plan.asOf.slice(0, 10) >= g.actualStatementDate);
  const outcome = ["not_comparable", "withdrawn", "revised"].includes(g.status)
    ? g.status
    : !actualAvailable
      ? "pending"
      : g.actual! < g.low
        ? "missed"
        : g.actual! > g.high
          ? "exceeded"
          : "met";
  answer.guidance = {
    metric: g.metric,
    period: g.period,
    target: `${g.low}–${g.high} ${g.unit}`,
    actual: actualAvailable ? g.actual : null,
    outcome,
    statementDate: g.statementDate,
    note: g.note,
  };
  answer.evidence = [
    g.targetEvidence,
    ...(actualAvailable && g.actualEvidence ? [g.actualEvidence] : []),
  ];
  answer.basis = `${g.period} · ${g.scope} · ${g.basis}`;
  answer.status =
    outcome === "pending" || outcome === "not_comparable"
      ? "partial"
      : "answered";
  if (outcome === "pending")
    answer.gaps.push(
      `A completed, date-eligible comparable actual is not available. Target period ends ${g.periodEnd}.`,
    );
  return answer;
}
