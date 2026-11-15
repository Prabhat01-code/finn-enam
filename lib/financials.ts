import type { Evidence } from "./domain";
export type FinancialResults = {
  period: string;
  scope: string;
  basis: string;
  currency: string;
  unit: string;
  currentLabel: string;
  previousLabel: string;
  yearAgoLabel: string;
  metrics: {
    name: string;
    current: number | null;
    previous: number | null;
    yearAgo: number | null;
    note?: string;
  }[];
  evidence: Evidence[];
};
export type Guidance = {
  metric: string;
  scope: string;
  basis: string;
  unit: string;
  period: string;
  periodEnd: string;
  low: number;
  high: number;
  actual: number | null;
  statementDate: string;
  actualStatementDate?: string;
  speaker: string;
  status: string;
  note: string;
  targetEvidence: Evidence;
  actualEvidence: Evidence | null;
};
export type ReviewedAnalysis = {
  symbol: string;
  guidance: Guidance;
  results: FinancialResults;
};
export function guidanceOutcome(g: Guidance, asOf: string) {
  if (asOf.slice(0, 10) < g.periodEnd || g.actual === null || !g.actualEvidence)
    return "pending";
  if (g.actualStatementDate && asOf.slice(0, 10) < g.actualStatementDate)
    return "pending";
  return g.actual < g.low ? "missed" : g.actual > g.high ? "exceeded" : "met";
}
