import type { CompanyPage } from "../lib/company-page";
export function CompanyOverview({ page }: { page: CompanyPage }) {
  return (
    <section className="company-overview">
      <div className="section-bar">
        <h3>Company evidence snapshot</h3>
        <span className="badge">
          {page.cached ? "Saved evidence" : "Updated evidence"}
        </span>
      </div>
      <p className="small muted">
        {page.coverage.passages} indexed passages ·{" "}
        {page.coverage.annualReports} annual reports ·{" "}
        {page.coverage.transcripts} transcripts · as of {page.asOf.slice(0, 10)}
      </p>
      {!!page.business.length && (
        <details>
          <summary>What the company says about its business</summary>
          {page.business.map((e, i) => (
            <article className="claim-receipt" key={i}>
              <blockquote>{e.text}</blockquote>
              <a
                className="source-link"
                href={e.url + "#page=" + e.page}
                target="_blank"
                rel="noreferrer"
              >
                {e.title} · p. {e.page} ↗
              </a>
            </article>
          ))}
        </details>
      )}
      {!page.results && (
        <p className="small muted">
          Quarterly financial facts need verification. Available documents
          remain searchable.
        </p>
      )}
      {!page.coverage.passages && (
        <p>
          Source discovery will build this page as documents become available.
          Researching a company does not add it to your portfolio.
        </p>
      )}
    </section>
  );
}
