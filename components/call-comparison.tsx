"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, LoaderCircle, Sparkles } from "lucide-react";
import {
  COMPARISON_FOCUS,
  type ComparisonContext,
  type ComparisonFocus,
} from "../lib/call-comparison";
import type { Synthesis } from "../lib/model";

type ResponseData = ComparisonContext & {
  reviewedAvailable?: boolean;
  method?: string;
  model: { configured: boolean };
  synthesis?: Synthesis | null;
  modelError?: { code: string; message: string } | null;
};
const date = (value: string) =>
  new Date(value + "T12:00:00Z").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
async function request(
  symbol: string,
  asOf: string,
  body?: object,
  signal?: AbortSignal,
): Promise<ResponseData> {
  const cutoff = asOf ? asOf + "T23:59:59+05:30" : undefined;
  const params = new URLSearchParams({
    symbol,
    ...(cutoff ? { asOf: cutoff } : {}),
  });
  const r = await fetch("/api/comparison" + (body ? "" : "?" + params), {
    method: body ? "POST" : "GET",
    signal,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify({ symbol, asOf: cutoff, ...body }) : undefined,
  });
  const data = (await r.json()) as ResponseData & { error?: string };
  if (!r.ok) throw new Error(data.error || "Comparison could not be loaded.");
  return data;
}

export function CallComparison({
  symbol,
  asOf,
}: {
  symbol: string;
  asOf: string;
}) {
  const [context, setContext] = useState<ResponseData | null>(null);
  const [result, setResult] = useState<ResponseData | null>(null);
  const [earlier, setEarlier] = useState("");
  const [later, setLater] = useState("");
  const [focus, setFocus] = useState<ComparisonFocus>("guidance");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const version = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    const requestVersion = version;
    request(symbol, asOf, undefined, controller.signal)
      .then((data) => {
        setContext(data);
        setEarlier(data.pair?.earlier.id ?? "");
        setLater(data.pair?.later.id ?? "");
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Request failed");
      });
    return () => {
      controller.abort();
      requestVersion.current++;
    };
  }, [symbol, asOf]);
  const run = async () => {
    const current = ++version.current;
    setBusy(true);
    setError("");
    try {
      const data = await request(symbol, asOf, {
        earlierId: earlier,
        laterId: later,
        focus,
      });
      if (current === version.current) setResult(data);
    } catch (e) {
      if (current === version.current)
        setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      if (current === version.current) setBusy(false);
    }
  };
  const pair = result?.pair;
  return (
    <section className="call-comparison" aria-label="Compare earnings calls">
      <div className="comparison-intro">
        <span className="eyebrow">TWO CALLS. BOTH SIDES OF THE STORY.</span>
        <h2>What changed?</h2>
        <p>
          Compare management commentary with the original excerpts side by side.
          Start with the two most recent dated calls in this library, or choose
          a pair.
        </p>
      </div>
      {error && (
        <p className="comparison-error" role="alert">
          {error}
        </p>
      )}
      {!context && !error && (
        <p role="status">Finding dated call transcripts…</p>
      )}
      {context && (
        <>
          {context.pair ? (
            <form
              className="comparison-controls"
              onSubmit={(e) => {
                e.preventDefault();
                void run();
              }}
            >
              <label>
                Earlier call
                <select
                  aria-label="Earlier call"
                  value={earlier}
                  disabled={busy}
                  onChange={(e) => setEarlier(e.target.value)}
                >
                  {context.calls.map((c) => (
                    <option key={c.id} value={c.id}>
                      {date(c.date)}
                    </option>
                  ))}
                </select>
              </label>
              <span className="comparison-arrow" aria-hidden="true">
                <ArrowRight size={19} />
              </span>
              <label>
                Later call
                <select
                  aria-label="Later call"
                  value={later}
                  disabled={busy}
                  onChange={(e) => setLater(e.target.value)}
                >
                  {context.calls.map((c) => (
                    <option key={c.id} value={c.id}>
                      {date(c.date)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Focus
                <select
                  aria-label="Comparison focus"
                  value={focus}
                  disabled={busy}
                  onChange={(e) => setFocus(e.target.value as ComparisonFocus)}
                >
                  {Object.entries(COMPARISON_FOCUS).map(([key, item]) => (
                    <option key={key} value={key}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button primary"
                disabled={
                  busy ||
                  (!context.model.configured && !context.reviewedAvailable) ||
                  !earlier ||
                  !later ||
                  (context.calls.find((c) => c.id === earlier)?.date ?? "") >=
                    (context.calls.find((c) => c.id === later)?.date ?? "")
                }
                type="submit"
              >
                {busy ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Sparkles size={15} />
                )}{" "}
                {busy ? "Comparing both calls…" : "Compare calls"}
              </button>
            </form>
          ) : (
            <div className="comparison-empty">
              <h3>Two dated calls are needed</h3>
              <p>
                Use Discover documents above to add transcripts. Sources with
                unresolved dates remain available in the source library.
              </p>
            </div>
          )}
          {!context.model.configured && !context.reviewedAvailable && (
            <p>
              Source browsing is available. Add the server-side model key to
              generate a comparison.
            </p>
          )}
          <details className="comparison-coverage">
            <summary>Coverage and date limits</summary>
            <ul>
              {context.gaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </details>
        </>
      )}
      {busy && (
        <p role="status" className="comparison-progress">
          Reading both calls and checking each comparison. Your previous result
          stays below.
        </p>
      )}
      {result?.modelError && (
        <p role="alert" className="comparison-error">
          {result.modelError.message}
        </p>
      )}
      {result?.synthesis && pair && (
        <div className="comparison-result" aria-live="polite">
          <div className="comparison-result-heading">
            <h3>
              {result.synthesis.claims.length
                ? "What both calls support"
                : "No supported comparison yet"}
            </h3>
            <span className="badge green">
              {result.method === "source_reviewed"
                ? "Source-reviewed comparison"
                : result.synthesis.cached
                  ? "Saved comparison"
                  : "Source-linked comparison"}
            </span>
          </div>
          <p className="comparison-period">
            {date(pair.earlier.date)} <ArrowRight size={14} />{" "}
            {date(pair.later.date)} · {COMPARISON_FOCUS[result.focus].label}
          </p>
          {result.synthesis.claims.map((claim, i) => (
            <article className="comparison-card" key={i}>
              <p className="comparison-claim">{claim.text}</p>
              <span className="claim-kind">
                {result.method === "source_reviewed"
                  ? "Reviewed interpretation"
                  : claim.kind === "inference"
                    ? "FINN interpretation"
                    : "Reported in both sources"}
              </span>
              <div className="comparison-sides">
                {(["earlier", "later"] as const).map((side) => (
                  <div className={"comparison-side " + side} key={side}>
                    <h4>
                      {side === "earlier" ? "Earlier call" : "Later call"} ·{" "}
                      {date(pair[side].date)}
                    </h4>
                    {claim.citations
                      .filter((c) => c.evidence.documentId === pair[side].id)
                      .map((c, j) => (
                        <div key={j}>
                          <blockquote>{c.quote}</blockquote>
                          <p className="comparison-speaker">
                            {c.evidence.speaker ?? "Speaker not identified"} ·{" "}
                            {c.evidence.speakerRole ?? "unknown"}
                          </p>
                          <a
                            href={
                              c.evidence.url.replace(/#.*$/, "") +
                              "#page=" +
                              c.evidence.page
                            }
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open original · p. {c.evidence.page}
                            <ArrowUpRight size={14} />
                          </a>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            </article>
          ))}
          {!!result.synthesis.gaps.length && (
            <div className="answer-gaps">
              <strong>What remains unresolved</strong>
              <ul>
                {result.synthesis.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          )}
          <details className="answer-method">
            <summary>How this comparison was checked</summary>
            {result.method === "source_reviewed" ? (
              <p>{result.synthesis.validation.note}</p>
            ) : (
              <p>
                Every displayed comparison cites both selected calls. Quotes,
                numeric support and evidence dates are checked in code, followed
                by a separate model review. Interpretation still needs your
                judgment.
              </p>
            )}
            <p>
              {result.synthesis.model} · {result.synthesis.provider} ·{" "}
              {result.synthesis.usage.requests} requests ·{" "}
              {(result.synthesis.usage.durationMs / 1000).toFixed(1)}s ·{" "}
              {result.synthesis.usage.inputTokens ?? "—"} input /{" "}
              {result.synthesis.usage.outputTokens ?? "—"} output tokens.
            </p>
          </details>
        </div>
      )}
    </section>
  );
}
