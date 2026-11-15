import type { QuarterChanges as Changes } from "../lib/quarter-changes";
export function QuarterChanges({
  changes: c,
  onQuestion,
}: {
  changes: Changes;
  onQuestion: (q: string) => void;
}) {
  return (
    <section className="quarter-changes" aria-label="Quarterly changes">
      <div className="section-bar">
        <h2>What changed since last quarter?</h2>
        <span className="badge green">
          {c.status === "numbers_only"
            ? "Numbers only"
            : c.status === "supported"
              ? "Source-backed"
              : "Coverage gap"}
        </span>
      </div>
      {c.period && (
        <p>
          <strong>
            {c.previousPeriod} → {c.period}
          </strong>
          <span className="small muted">
            {" "}
            · latest verified table in this corpus
          </span>
        </p>
      )}
      {c.basis && <p className="small muted">{c.basis}</p>}
      <div className="quarter-change-grid">
        {c.items.map((item, i) => (
          <article className="quarter-change" key={i}>
            <span className="eyebrow">
              {item.kind === "financial"
                ? "CALCULATED CHANGE"
                : "MANAGEMENT COMMENTARY"}
            </span>
            <h3>{item.title}</h3>
            <div className="quarter-values">
              <div>
                <span className="small muted">{c.previousPeriod}</span>
                <strong>{item.before}</strong>
              </div>
              <span aria-hidden="true">→</span>
              <div>
                <span className="small muted">{c.period}</span>
                <strong>{item.after}</strong>
              </div>
            </div>
            <p>
              <strong>{item.difference}</strong>
            </p>
            <p className="small muted">{item.relevance}</p>
            <details>
              <summary>Inspect both periods</summary>
              {item.evidence.map((e, j) => (
                <div className="claim-receipt" key={j}>
                  <blockquote>{e.text}</blockquote>
                  <a
                    className="source-link"
                    href={e.url + "#page=" + e.page}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {e.title} · p. {e.page} ↗
                  </a>
                </div>
              ))}
            </details>
            <button
              className="text-button"
              onClick={() => onQuestion(item.question)}
            >
              Explore this change ↗
            </button>
          </article>
        ))}
      </div>
      <div className="answer-gaps">
        {c.gaps.map((g, i) => (
          <p key={i}>{g}</p>
        ))}
      </div>
    </section>
  );
}
