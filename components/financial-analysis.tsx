import { growth, type Evidence } from "../lib/domain";
import {
  guidanceOutcome,
  type FinancialResults,
  type ReviewedAnalysis,
} from "../lib/financials";
const num = (v: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(v);
const change = (a: number | null, b: number | null) => {
  const n = a !== null && b !== null ? growth(a, b) : null;
  return n === null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
};
export function ResultsTable({
  results: r,
  onEvidence,
}: {
  results: FinancialResults;
  onEvidence: (e: Evidence[]) => void;
}) {
  return (
    <section className="results-section">
      <div className="section-bar">
        <h3>A first cut of the numbers</h3>
        <span className="badge green">{r.period}</span>
      </div>
      <p className="small muted">
        {r.scope} · {r.currency} {r.unit} · {r.basis}
      </p>
      <p className="small muted">
        QoQ: {r.previousLabel} · YoY: {r.yearAgoLabel}
      </p>
      <div
        className="results-table"
        role="table"
        aria-label="Quarterly financial comparison"
      >
        <div className="results-head" role="row">
          <span>METRIC</span>
          <span>{r.currentLabel}</span>
          <span>QoQ</span>
          <span>YoY</span>
        </div>
        {r.metrics.map((m) => (
          <div className="results-row" role="row" key={m.name}>
            <div>
              <strong>{m.name}</strong>
              {m.note && <small>{m.note}</small>}
            </div>
            <strong>
              {m.current === null ? "Unavailable" : num(m.current)}
            </strong>
            <span>{change(m.current, m.previous)}</span>
            <span>{change(m.current, m.yearAgo)}</span>
          </div>
        ))}
      </div>
      <button className="text-button" onClick={() => onEvidence(r.evidence)}>
        Inspect values and reporting basis ↗
      </button>
    </section>
  );
}
export function FinancialAnalysis({
  analysis: a,
  onEvidence,
}: {
  analysis: ReviewedAnalysis;
  onEvidence: (e: Evidence[]) => void;
}) {
  const g = a.guidance,
    outcome = guidanceOutcome(g, new Date().toISOString());
  return (
    <section className="ledger">
      <div className="ledger-intro">
        <div>
          <div className="eyebrow">SOURCE-CHECKED COMPARISON · {g.period}</div>
          <h2>{g.metric}: the target and outcome</h2>
          <p>{g.note}</p>
        </div>
      </div>
      <div className="ledger-feature">
        <div className="promise">
          <span className="eyebrow">WHAT MANAGEMENT SAID</span>
          <div className="ledger-number">
            {g.low}–{g.high}
            <span>{g.unit === "percent" ? "%" : ""}</span>
          </div>
          <p>{g.unit === "percent" ? g.metric : g.unit}</p>
          <p className="small">
            {g.basis} · {g.scope}
          </p>
          <p className="small">
            Statement: {g.statementDate} · {g.speaker}
          </p>
          <button
            className="text-button"
            onClick={() => onEvidence([g.targetEvidence])}
          >
            Read the target ↗
          </button>
        </div>
        <div className="delivered">
          <span className="eyebrow">
            {outcome === "pending"
              ? "AWAITING A COMPARABLE ACTUAL"
              : "WHAT HAPPENED"}
          </span>
          <div className="ledger-number">
            {outcome === "pending" ? "Pending" : num(g.actual!)}
          </div>
          <span className={"badge " + (outcome === "met" ? "green" : "amber")}>
            {outcome === "pending"
              ? `Target period ends ${g.periodEnd}`
              : outcome === "met"
                ? "Within the guidance range"
                : outcome}
          </span>
          {g.actualEvidence && (
            <button
              className="text-button"
              onClick={() => onEvidence([g.actualEvidence!])}
            >
              Read the actual ↗
            </button>
          )}
        </div>
      </div>
      <ResultsTable results={a.results} onEvidence={onEvidence} />
    </section>
  );
}
