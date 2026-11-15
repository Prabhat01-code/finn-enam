# Research workflow upgrade — local revision

The user approved this sequence: question routing → unattended jobs and automatic company pages → quarter-change cards → measured hybrid search. FastAPI migration was explicitly declined. The existing TypeScript / React / Cloudflare Worker / D1 stack is retained. Deployment, sharing, GitHub and cloud schedules were not changed.

## Implemented behavior

### Typed questions

`question-plan.ts` selects numerical, explanation, guidance or narrative paths. Numerical and guidance answers do not request embeddings or chat synthesis. Financial values carry metric, quarter, scope, unit, basis and source receipts. Unknown/unsupported periods, segments, currencies and compound metric requests return a gap instead of changing the question. Ambiguous growth returns both QoQ and YoY. Margin differences use percentage points; zero/negative growth bases abstain.

The guidance path uses the latest date-eligible revision of a matching annual target, hides unavailable actuals, and distinguishes pending from met/missed/exceeded. Reviewed records are currently available for three prepared companies. This is not an automatic verified guidance extractor for every ticker.

Explanations establish a requested numerical decline before model synthesis. If the premise is unsupported or contradicted, FINN shows the calculation/gap without inventing a cause. Eligible commentary is restricted to the selected quarter. Existing bounded quote/claim support checks remain in force.

The shared fact catalog ties reviewed facts to current content-hash source IDs. A manually reviewed table from the exact scanned HCL filing remains usable even though automated text extraction is partial. That exception does not apply to arbitrary unreadable PDFs. Replaced source IDs invalidate their old fact tables.

### Jobs and automatic company pages

`company-page.ts` implements get-or-build on the existing API boundary. Cached results include company identity, business excerpts, coverage, available numerical results, guidance and quarter changes. Historical replay does not implicitly collect present-day data. Partial source coverage is explicit. Researching a company does not change its portfolio membership.

Source jobs are persisted before HTTP 202, atomically deduplicated, rate/capacity limited, and driven by an authenticated server runner. The browser only polls progress. Stages use expiring leases with fenced final writes, bounded retries, shared source storage and saved result links. The worker checks opted-in portfolios every 30 minutes and persists company pages after research finishes. A cloud schedule is not yet enabled.

A real unfamiliar HAVELLS request was submitted concurrently three times; all returned the same job. After the requesting client exited, the runner indexed one annual report, four transcripts and 748 passages. A results attachment was fetched but did not produce a verified comparable financial table; the page/card reports that gap. A separate stopped-worker/expired-lease test verified resumption after restart.

### Quarter changes

`quarter-changes.ts` creates up to five supported items from comparable financial facts and source-reviewed statement pairs. Cards show both values, period labels, QoQ and YoY where available, relevance notes, source receipts and related questions. One primary financial table may support both comparative periods when it explicitly reports both columns.

Polycab and HCL cards include reviewed commentary aligned to Q1/Q2 FY27. Infosys's latest verified fact table in this corpus is Q4 FY25; its FY27 calls are therefore excluded from that financial card. It remains numbers-only. Missing commentary is not treated as a resolved risk or absence of change. Generic company cards remain partial where typed facts are unavailable.

### Measured hybrid retrieval

`hybrid-search.ts` filters current company/source revisions, date and explicit period before either branch. `retrieval-service.ts` caches vectors by source passage/revision, embedding endpoint/model/version and retrieval version; query vectors are cached separately. One ingestion stage embeds at most 16 passages, with a daily batch budget and a 2,000-passage per-company bound. Incomplete/unavailable vectors fall back to the complete lexical corpus. Numerical facts never come from vector similarity.

RRF combines ranks, not raw BM25/cosine scores. The semantic branch is opt-in via the server-only variables in `.dev.vars.example`. Hyde chat configuration is not reused as embedding configuration. No embedding provider was configured in the app or deployment.

A local `sentence-transformers/all-MiniLM-L6-v2` experiment embedded 3,693 real saved source passages and 12 frozen development queries, without paid model calls. Identical company/date/period filters were used for all branches. Full required evidence at rank 8 was retrieved in 7/12 lexical cases, 6/12 semantic cases and 9/12 fused cases. The fused branch introduced no observed source-filter violations or regressions on this small set. Three queries still missed their labelled anchors. One case is an empty historical corpus guard, so these totals are not answer accuracy and are not a held-out benchmark.

The model embedding run took about 265 seconds including first download/loading. This is offline indexing time, not hosted request latency. The model can truncate long passages; the runtime adapter caps text at 1,600 characters but the configured provider's tokenizer limits still matter. No reranker or separate vector database was added.

See `retrieval-evaluation.json` for per-case failures, receipts and metrics. Lexical remains the shipped default pending a configured provider and broader evaluation.

## Reproducing retrieval measurement

Use an isolated Python environment; this is an offline evaluation tool, not a Python app backend:

```sh
python3 -m venv .sites-runtime/embedding-eval
.sites-runtime/embedding-eval/bin/python -m pip install -r scripts/embedding-eval-requirements.txt
npm run evaluate:retrieval -- --prepare
.sites-runtime/embedding-eval/bin/python scripts/embed-evaluation.py
npm run evaluate:retrieval
```

The model download and generated vectors are ignored checkout-local artifacts. Do not include them or API keys in the source ZIP. The benchmark labels are frozen in `data/retrieval-evaluation-cases.json`.

## Verification and limits

- Final checks passed: 63 deterministic tests, TypeScript, lint, production build, existing API regressions and the new research workflow check. The standard Vinext static-analysis classification notice remains informational.
- `research-workflow-evaluation.json`: numerical paths for three companies, false-premise withholding, historical cutoffs, cached pages, unchanged portfolio, worker authorization and job ownership, plus real HAVELLS readback.
- `worker-recovery-evaluation.json`: persisted queued job completed after restarting the runner and reclaiming an expired lease; no browser step calls.
- Desktop/mobile UI inspection confirmed quarter cards, source controls and related-question navigation. Mobile width had no horizontal overflow. Screenshots are local outputs.
- One small Hyde connectivity probe returned HTTP 200. This is connection/authentication evidence, not a fresh answer-quality evaluation. The temporary Groq credential posted in chat was not needed, stored or used; rotation was recommended.
- Earlier generated-comparison failures remain documented. A wider answer/entailment benchmark, hosted unattended activation, configured semantic provider, final deployment and GitHub publication remain separate work.

## Primary technical references

- Cloudflare execution context and background lifetime: https://developers.cloudflare.com/workers/runtime-apis/context/
- Scheduled handler: https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/
- RRF: https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reciprocal-rank-fusion
- MiniLM model and truncation: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2
- Local ONNX evaluator: https://qdrant.github.io/fastembed/
- Hyde documented models: https://inference.hyde.tech/docs/models
