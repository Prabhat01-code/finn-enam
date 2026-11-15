import type { StructuredAnswer as Answer } from "../lib/question-plan";
const number = (n: number | null | undefined) =>
  n == null
    ? "Unavailable"
    : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
export function StructuredAnswer({ answer }: { answer: Answer }) {
  return (
    <section className="synthesis" aria-label="Verified financial answer">
      <div className="synthesis-heading">
        <div>
          <span className="eyebrow">FACTS AND CALCULATIONS</span>
          <h3>{answer.heading}</h3>
        </div>
        <span className="badge green">Calculated in code</span>
      </div>
      {answer.basis && <p className="small muted">{answer.basis}</p>}
      <div className="answer-claims">
        {answer.calculations.map((c, i) => (
          <article className="answer-claim" key={i}>
            <span className="claim-kind">{c.label}</span>
            <p>
              <strong>
                {number(c.value)}
                {c.value === null ? "" : ` ${c.unit}`}
              </strong>
            </p>
            <p className="small">
              {c.period}: {number(c.current)}
              {c.previous !== undefined
                ? ` · ${c.comparisonPeriod}: ${number(c.previous)}`
                : ""}
            </p>
            <p className="small muted">{c.formula}</p>
          </article>
        ))}
      </div>
      {answer.guidance && (
        <article className="answer-claim">
          <span className="claim-kind">
            {answer.guidance.period} · {answer.guidance.metric}
          </span>
          <p>
            Target: <strong>{answer.guidance.target}</strong> · Actual:{" "}
            <strong>{number(answer.guidance.actual)}</strong>
          </p>
          <p>
            Outcome:{" "}
            <strong>{answer.guidance.outcome.replaceAll("_", " ")}</strong> ·
            Statement: {answer.guidance.statementDate}
          </p>
          <p className="small">{answer.guidance.note}</p>
        </article>
      )}
      {!!answer.gaps.length && (
        <div className="answer-gaps">
          <strong>Evidence limits</strong>
          <ul>
            {answer.gaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}
      {!!answer.evidence.length && (
        <details className="claim-receipts">
          <summary>Inspect source values and reporting basis</summary>
          {answer.evidence.map((e, i) => (
            <div className="claim-receipt" key={i}>
              <blockquote>{e.text}</blockquote>
              <a
                href={e.url + "#page=" + e.page}
                target="_blank"
                rel="noreferrer"
              >
                {e.title} · p. {e.page} ↗
              </a>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
