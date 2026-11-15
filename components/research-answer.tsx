import { ArrowUpRight, CheckCircle2, CircleHelp, Sparkles } from "lucide-react";
import type { Synthesis } from "../lib/model";

export function ResearchAnswer({ answer }: { answer: Synthesis }) {
  return (
    <section className="synthesis" aria-label="Cited model answer">
      <div className="synthesis-heading">
        <div>
          <span className="eyebrow">
            <Sparkles size={13} /> AN ANSWER YOU CAN INSPECT
          </span>
          <h3>
            {answer.status === "answered"
              ? "What the evidence supports"
              : "The evidence is not enough yet"}
          </h3>
        </div>
        <span className="badge green">
          GLM 5.3 Flash{answer.cached ? " · saved answer" : ""}
        </span>
      </div>
      {answer.status !== "answered" && (
        <p className="muted">
          The model reviewed the retrieved excerpts but could not produce a
          supported answer. The evidence gaps below explain what is missing.
        </p>
      )}
      <div className="answer-claims">
        {answer.claims.map((claim, i) => (
          <article className={"answer-claim " + claim.kind} key={i}>
            <span className="claim-kind">
              {claim.kind === "reported"
                ? "Reported in the source"
                : "FINN interpretation"}
            </span>
            <p>{claim.text}</p>
            <details className="claim-receipts">
              <summary>
                {claim.citations.length === 1
                  ? "Read the supporting excerpt"
                  : `Read ${claim.citations.length} supporting excerpts`}
              </summary>
              {claim.citations.map((c, j) => (
                <div className="claim-receipt" key={j}>
                  <blockquote>{c.quote}</blockquote>
                  <a
                    href={c.evidence.url + "#page=" + c.evidence.page}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {c.sourceId} · {c.evidence.title} · p. {c.evidence.page}
                    <ArrowUpRight size={13} />
                  </a>
                </div>
              ))}
            </details>
          </article>
        ))}
      </div>
      {!!answer.gaps.length && (
        <div className="answer-gaps">
          <div className="row">
            <CircleHelp size={17} />
            <strong>What remains unresolved</strong>
          </div>
          <ul>
            {answer.gaps.map((gap, i) => (
              <li key={i}>{gap}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="answer-verification">
        <CheckCircle2 size={15} />
        <span>
          Quoted text and source references checked. Interpretation still needs
          your judgment.
        </span>
      </div>
      <details className="answer-method">
        <summary>About this answer</summary>
        <p>{answer.validation.note}</p>
        <p>
          {answer.model} via {answer.provider} ·{" "}
          {(answer.usage.durationMs / 1000).toFixed(1)}s ·{" "}
          {answer.usage.inputTokens ?? "—"} input /{" "}
          {answer.usage.outputTokens ?? "—"} output tokens.{" "}
          {answer.validation.rejectedClaims
            ? `${answer.validation.rejectedClaims} draft claims withheld.`
            : ""}
        </p>
        <p>
          Generated{" "}
          {new Date(answer.generatedAt).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
          })}{" "}
          IST.{" "}
          {answer.cached
            ? "Reused for the same question, evidence and date."
            : "No investment recommendation is implied."}
        </p>
      </details>
    </section>
  );
}
