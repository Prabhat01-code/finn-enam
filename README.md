# FINN

**Less noise. More signal.** A mobile-first portfolio inbox and primary-source research workspace for the ENAM AI Engineer Build Challenge.

FINN connects a filing worth investigating to the company documents behind it. The Infosys demonstration follows one FY25 revenue-growth target through four revisions, then compares the final range with the matching full-year actual. It preserves the distinction between “exceeded the original target” and “missed the final target.” Polycab adds a completed capex comparison; HCLTech adds a pending annual target with explicitly different acquisition bases. Both include source-checked quarterly results.

- **18-company mock portfolio:** real NSE disclosures and completed daily price/volume observations. Configurable price, volume and announcement rules; read state and deduplicated alerts persist in D1.
- **Research:** searchable NSE security master; annual-report and transcript discovery for arbitrary tickers. Four prepared companies: INFY, HCLTECH, POLYCAB and TCS. ASIANPAINT demonstrates the same pipeline outside the initial portfolio.
- **Cited answers:** `hyde/glm-5.3-flash` through Hyde's OpenAI-compatible endpoint. The server retrieves eligible primary evidence, validates quoted text and numeric support, permits one bounded correction, and performs a separate claim-support review. It withholds contradictions, unsupported attribution and claims that still fail. Sources remain accessible if the model is unavailable.
- **Historical evidence:** an as-of date excludes future publications; undated documents are eligible only after retrieval. The manually checked ledger is separate from model-generated answers.
- **What changed?** Select two dated calls and inspect their excerpts side by side. Five source-reviewed observations cover Infosys, HCLTech and Polycab, including unchanged guidance and an acquisition-basis change. Those exact pairs use no model call and are labelled accordingly. Other pairs/topics use bounded synthesis with paired citations and conservative abstention.
- **Typed questions:** numerical requests use comparable financial facts and code calculations; guidance requests select dated targets/revisions and matching actuals. Explanations verify an asserted decline before requesting management commentary. Unsupported metrics, bases and periods return explicit gaps.
- **Automatic company pages:** selecting a company returns its saved evidence page or queues missing/stale source work. A separate authenticated worker continues without the browser, retries bounded stages and saves the finished page. Research does not change the followed portfolio.
- **Quarter-change cards:** up to five changes, with before/after values, QoQ/YoY context, margin changes in percentage points/bps, and original receipts. Reviewed narrative changes must match the same quarters. Otherwise the card is explicitly numbers-only.
- **Measured hybrid retrieval:** a configurable embedding adapter and reciprocal-rank fusion are implemented. Lexical search remains the default; hybrid needs its own documented embedding endpoint and completed index. After query-concept fixes, keyword and hybrid retrieval each recover all required evidence in 11/12 development cases, with different misses. Earlier scores were 7/12 and 9/12. Hybrid stays disabled because this small set does not show an aggregate benefit. This is not an answer-accuracy score.

## Submission links

- [Live prototype](https://finn-prabhat-enam.shadowps-07.chatgpt.site)
- [GitHub source](https://github.com/Prabhat01-code/finn-enam)
- [Actual AI collaboration export and scope note](docs/AI-HISTORY.md)
- [Short covering writeup](docs/COVERING-WRITEUP.md)
- [Three-minute demo](docs/DEMO-WALKTHROUGH.md)
- [Production verification receipt](docs/PRODUCTION-VERIFICATION.json)

## Run locally

Requires Node.js 22.13+ and npm. No model key is needed for the inbox, evidence search or verified example.

```sh
git clone https://github.com/Prabhat01-code/finn-enam.git
cd finn-enam
npm ci
cp .dev.vars.example .dev.vars
# Optional: edit .dev.vars and set HYDE_API_KEY. Never commit that file.
npm run build
npm run db:migrate
npm run dev
```

Open the localhost URL printed by the development server (normally port 5173). Local development can simulate sign-in at `/signin-with-chatgpt?return_to=/`; hosted access is handled by Sites. Restart the dev server after changing `.dev.vars`.

For automatic source jobs, configure `FINN_MONITOR_KEY` (32+ random characters) in `.dev.vars`, restart the server, and run `npm run worker` in another terminal. The browser reads progress; it no longer drives source processing. See [MONITORING.md](docs/MONITORING.md).

```dotenv
HYDE_API_KEY=your-key-here
HYDE_MODEL=hyde/glm-5.3-flash
```

These are **server-only** environment variables. Do not use a `NEXT_PUBLIC_` or `VITE_` prefix. The production key belongs in the hosting platform's secret store, not the Git repository, deployment manifest or browser.

## Try it in five minutes

1. Open **Today**. The default is the current 24-hour window. On a quiet weekend, choose **7 days** or the explicitly dated **Snapshot** replay. Inspect a filing, then follow **Investigate**. A results card can show a reviewed table; **Read attachment** indexes other source PDFs.
2. Open **Research → INFY → Said / delivered**. Read the four dated guidance revisions, inspect the original PDF passages, and check the Q4 FY25 revenue/PBT/PAT calculation table. EBITDA is explicitly unavailable.
3. Open **Ask the evidence**, set the date to 22 April 2025, and ask: “What was the FY25 revenue growth guidance and actual full-year growth? State the reporting basis.” Open each answer's supporting excerpts.
4. Change the date to 1 June 2024 and ask about FY25 guidance. Later revisions and the actual result are excluded.
5. Search another NSE company. Its page is returned from saved evidence or source work is queued automatically. Keep the local worker running. HAVELLS was verified through this workflow: one annual report, four transcripts and 748 passages, plus a consolidated results table with revenue, PBT and PAT extracted from page 9. EBITDA remains unavailable. **Discover documents** requests a manual refresh.
6. Change a price or volume threshold in **Portfolio**, save, and refresh sources. Rules use completed sessions and deduplicate repeated filings/session alerts.
7. Open **Research → HCLTECH → What changed? → Compare calls**. The July organic guidance and October guidance including acquisitions are explicitly not treated as a like-for-like upgrade. Try INFY for revised revenue guidance and unchanged margin guidance, or POLYCAB for EBIT versus EBITDA.

## Checks

```sh
npm test                 # Deterministic financial, retrieval and model-boundary tests
npm run typecheck
npm run lint
npm run test:api         # Isolated visitor state, 520 read updates; running local server required
# FINN_TEST_LIVE=1 npm run test:api also exercises live feeds
npm run check:model      # Paid live Hyde request(s), reads local .dev.vars
npm run evaluate:model   # Seven live research cases + expected-fact and cache checks; running app required
npm run evaluate:extended # Eight additional workflow cases; discover DIXON and CERA first
node tests/comparison-api.mjs # Pair validation and no-model historical coverage checks
node tests/research-workflow-api.mjs # New flow checks; requires the saved local HAVELLS test session
npm run evaluate:retrieval # Uses local benchmark vectors when present; see RESEARCH-UPGRADE doc
```

`docs/model-evaluation.json` records real end-to-end observations. It is a small regression set, not a general accuracy claim. Some draft claims are deliberately withheld after validation. Quote matching does not establish semantic entailment, and a model answer can still require correction.

`docs/extended-evaluation.json` adds three observed model-answer cases (DIXON, CERA and an instruction-injection question), three explicitly source-reviewed call comparisons and two no-generation coverage guards. It records incremental runs, not a single clean benchmark. Earlier generated-comparison failures remain in `docs/evaluation-history/extended-before-paired-review.json`. See `docs/CALL-COMPARISON-2026-11-15.md` for the resulting design and verification limits.

## Data and provenance

`data/snapshot.json` contains the saved demonstration data; `data/source-manifest.json` records source URLs, retrieval dates and PDF hashes. `data/analysis.json` contains the checked Infosys comparison and result values. `data/reviewed-analyses.json` covers Polycab/HCLTech. `data/metadata-review.json` records the primary-source metadata corrections; letter dates remain separate from exchange publication time. Raw PDFs and local diagnostic outputs are ignored by Git.

| Input | Source and treatment |
| --- | --- |
| NSE security master | NSE's published security CSV; 2,635 entries in this snapshot |
| Prices and volume | Yahoo Finance daily chart API; completed observations only; unadjusted closes; known splits suppress affected alerts |
| Corporate announcements | NSE dated company responses; description-based deterministic categorisation; no claim of exhaustive pagination |
| Annual reports/transcripts | Screener is used only to discover links; research uses the linked company/exchange PDFs |
| Model synthesis | Hyde Chat Completions, `hyde/glm-5.3-flash`, low reasoning, 6,144 maximum output tokens per call |

The volume baseline is the **previous 20 valid sessions**, excluding the current session. Growth calculations require positive comparison bases. Guidance comparisons require matching metric, reporting basis, entity scope and period; annual targets remain pending until the period ends.

## Implementation

React + TypeScript run on Vinext/Vite, with a Cloudflare Worker API and SQLite-compatible D1 storage. The deployment uses the Sites starter's maintained auth/build integrations.

```text
NSE / Yahoo / company PDFs
        ↓ collect, validate identity, hash, extract page text
Saved snapshot + D1 records
        ├─ deterministic filing/rule evaluation → attention inbox
        ├─ typed question plan → comparable facts → code calculation / guidance outcome
        ├─ company/date/period filter → lexical or configured hybrid retrieval
        └─ bounded evidence → Hyde → schema/quote/number/contradiction checks → support review → cited answer
```

- `lib/domain.ts`: classifiers, comparable financial calculations, historical retrieval.
- `lib/collectors.ts`, `lib/passages.ts`: bounded source access and PDF extraction.
- `lib/services.ts`, `lib/store.ts`: persisted source jobs, user settings and idempotent alerts.
- `lib/model.ts`, `lib/answer-service.ts`: prompts, provider boundary, validation, caching, quotas and diagnostics.
- `app/api/[...path]/route.ts`: validated API and same-origin writes.
- `app/page.tsx`, `components/research-answer.tsx`: responsive inbox and evidence-led research.
- `docs/ARCHITECTURE.md`: trust boundaries, tradeoffs and next steps.
- `docs/AI-HISTORY.md`: filtered export of actual user-visible collaboration messages.

## Refresh and monitoring

`npm run collect -- INFY` refreshes the offline fixture through the real collectors; omitting tickers collects the default portfolio. This changes the dated snapshot. The live UI's **Refresh sources** writes current observations to D1 without changing the saved snapshot.

Configure the same random `FINN_MONITOR_KEY` (at least 32 characters) in the server and runner environments. `npm run worker` advances all queued source jobs independently of browsers and submits refresh jobs every 30 minutes for portfolios explicitly opted in through Alert preferences. `npm run worker -- --once` processes one bounded cycle. The older `monitor` command remains available for subscribed portfolio refreshes. Set `FINN_ORIGIN` for a remote HTTPS instance and configure any hosting service access separately. Expired leases allow another worker to recover interrupted work; ownership tokens fence final job updates.

The release includes a credential-free cloud-worker runbook at `/api/worker-instructions`. The protected writer advances queued jobs and portfolios explicitly opted into monitoring; it does not generate model answers. A linked Sites cloud schedule runs hourly at :30 Asia/Kolkata, after successful writer/readback verification. The platform rejected a 30-minute schedule because its minimum interval is one hour. Check [the release verification receipt](docs/PRODUCTION-VERIFICATION.json) for its saved schedule and observed production results. Browser notifications and email delivery are not enabled. See `docs/MONITORING.md`.

## Deployment

The existing Sites project is declared in `.openai/hosting.json`. Use the Sites source/build/package/deploy workflow; do not create a second project. Set `HYDE_API_KEY` as a production secret and `HYDE_MODEL` as a runtime variable, then deploy the exact saved source version. D1 migrations are included in the source.

FINN is hosted publicly at [finn-prabhat-enam.shadowps-07.chatgpt.site](https://finn-prabhat-enam.shadowps-07.chatgpt.site) using Sites, Cloudflare Workers and D1. The release preserves public access. The source repository is [Prabhat01-code/finn-enam](https://github.com/Prabhat01-code/finn-enam). The application source matches hosted version 4, commit `b2290702e3847e70fe2e189bb5de0d24ae768fa1` in the Sites source repository; GitHub adds submission documents and has its own commit history. This source publication does not move the running app to GitHub Pages.

## Practical limitations

- Three prepared companies have reviewed analysis. Generic results extraction accepts only tables with explicit scope, units and comparable quarter columns; ambiguous tables return unavailable. Arbitrary numerical guidance is not automatically labelled verified.
- Source coverage is partial. The online PDF limit is 32 MB / 550 pages with retries and BSE alias recovery. DIXON’s 520-page annual report passed through the running Worker. `scripts/ocr-pages.py` offers local OCR recovery with confidence filtering and required visual review; OCR is not hosted. Publication dates are never inferred from download time or transcript labels.
- Lexical retrieval is active by default. The optional semantic branch needs a separately configured embedding model and index; Hyde chat settings do not imply embedding support. The MiniLM hybrid experiment still misses one of twelve development cases and regresses one case that keyword search finds. Unconfigured, incomplete or failing semantic retrieval reports a lexical fallback.
- Model calls have 35-second timeouts, one correction plus one support review at most, 24-hour evidence-sensitive caching, and atomic limits of 30 upstream requests per user / 100 total per UTC day. Provider billing and rate limits remain separate; token counts are shown when available.
- The server-only `FINN_DAILY_MODEL_REQUESTS` can explicitly configure the global limit (1–200; default 100). Local evaluations temporarily raised this to 150 without resetting usage counters, then restored the prior setting. Source-reviewed comparisons use zero provider requests. Production retains the default global limit.
- A comparison uses the latest two **dated indexed** calls by default; missing or undated transcripts can mean they are not consecutive. Model review cannot prove semantic correctness, and a missing mention never proves a newly emerging or resolved risk. Reviewed examples are distinguished from generated research.
- Priority explanations are rules-based interpretations of exchange descriptions. An attachment is not described as read unless indexed. There is no investment recommendation or invented portfolio weighting.

## Release verification

See [the verification record](docs/VERIFICATION.md) and `docs/RELEASE-2026-11-15.md` for checks and limitations. Earlier audit notes are retained as historical records. The CI workflow is configured for lint, TypeScript, deterministic tests and the production build without model credentials. Its first GitHub run could not start because of an account-level runner restriction; hosted CI has not passed.

See [RESEARCH-UPGRADE-2026-11-15.md](docs/RESEARCH-UPGRADE-2026-11-15.md) for the question router, unattended jobs, company pages, quarter cards, benchmark and remaining activation steps.
