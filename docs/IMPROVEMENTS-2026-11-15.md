# Local audit fixes — 15 November 2026

This report records the first audit-fix pass. The subsequent evaluation/comparison work is documented in `CALL-COMPARISON-2026-11-15.md`. This revision is local and has not been deployed. The owner-private hosted version remains version 2. No innovation features, GitHub publication, access changes or submission email were performed.

## Audit closure

| Finding | Implemented and verified locally | Remaining practical limit |
| --- | --- | --- |
| Source metadata | Reviewed 26 primary documents; corrected the TCS 2025/2026 mismatch, Infosys investor-day classification and Asian Paints call-versus-filing month labels. Stored primary receipts and distinct document/call/period dates. Reindexed available documents with speaker context. | Cover-letter dates do not establish exchange publication time. Unknown publication dates remain unknown and historical retrieval stays conservative. |
| Incorrect cited claims | Added contradiction gates for swapped values, reversed direction, forecasts presented as actuals, and analyst questions attributed to management. Added a separately budgeted model support review; failure withholds the answer. | Neither rules nor model review prove every interpretation correct. |
| Weak evaluation | Seven cases now assert expected facts, basis/cutoff behavior and abstention. Added a plausible unsupported dividend question. All recorded cases pass after fixes; the final guidance case was rerun separately after its fiscal-year binding correction. | A small regression set, not an accuracy percentage. Observations are from incremental runs, not one uninterrupted final run. |
| Empty portfolio/read state | Safe snapshot fallback; atomic individual read updates; independent HttpOnly visitor sessions. API test saves 520 items concurrently and restores prior state in `finally`. | Public deployment still requires deliberate hosting access and operational review. |
| Uneven analysis | Shared financial components; checked Infosys, Polycab and HCLTech examples. Polycab capex met its range; HCL annual guidance remains pending. Added conservative generic results-table extraction. | Arbitrary guidance is not automatically labelled verified. Generic tables with ambiguous dates, units or layout abstain. |
| Manual refresh/freshness | Current window is default; market watch follows selected data mode; source freshness is inspectable. Persisted jobs resume on reload. Authenticated monitor advances opted-in portfolios, with retention and deduplicated alerts. | Production schedule deliberately inactive until this revision is deployed and unattended Site access is verified. |
| Inbox categorisation | Capital-action meeting notices and auditor rotation corrected. Drawer can index original attachments. BSE aliases match indexed evidence. Reviewed HCL/Polycab results open from their associated filing. | Most older filings still show their exchange description until indexed. General attachment enrichment is on demand; automatic biography enrichment is deferred. |
| Document coverage | 32 MB online bound, bounded retry/backoff, BSE alias recovery, capped-response splitting, staged passage revisions and recovery from obsolete failed records. DIXON annual report (520 pages) and four transcripts succeeded through the running Worker. Recovered HCL April transcript from issuer site. | Exchange completeness cannot be guaranteed. Local OCR is available; hosted OCR is not enabled. |
| Mobile/continuity | Larger text and controls, reduced research header, visible volume ratios, company/query/tab URLs, retained reading context during generation and source-job recovery. | Browser QA is manual; CI currently covers code/build checks. |
| Engineering/handoff | Formatted application code, removed broad application `any` types, clean scoped lint, regression tests and CI. Updated source manifest. | Reviewer access, GitHub delivery and final submission links await final deployment/publication. |

## Verification

- All 32 deterministic tests passed: the original 22 cases plus audit regressions, source recovery, conservative generic tables and separate support review.
- Lint and TypeScript pass. Production build passed; final change checks are recorded in the task handoff.
- Local API integration passed with 520 concurrent read-state writes, empty portfolio, visitor isolation and rejected unauthenticated monitor access.
- Authenticated monitor completed two refreshes of an isolated one-company portfolio, created a real threshold alert and did not duplicate it. Test settings and portfolio were restored.
- DIXON live ingestion: one 520-page annual report and four transcripts; zero document gaps after replacing the obsolete 12 MB failure record.
- Local OCR: a real scanned HCL consolidated results page had zero extractable characters. The recovery script produced 2,598 characters at 92.7 mean word confidence, marked as requiring visual review. No OCR values were automatically promoted to verified facts.
- Saved model evaluation includes seven content-checked cases and cache verification. Some draft claims are intentionally withheld.
- Browser checks verified the mobile portfolio's price/volume visibility, Polycab's completed capex comparison, HCLTech's pending annual target and results table, source passages, and company/tab restoration after reload.

## Source handoff

`FINN-source-improved.zip` contains this local working revision. It is newer than the baseline Git commit and hosted version 2; it is not a newly committed or deployed release. The original `FINN-source.zip` is preserved. The improved archive excludes secrets, dependency folders, runtime databases, build output and ignored research downloads. Its `SOURCE-ARCHIVE-MANIFEST.json` records the baseline commit and SHA-256 of each included file.

## Running the additional checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
# With the local server running:
npm run test:api
node tests/monitor-smoke.mjs  # Requires local FINN_MONITOR_KEY and real source access
npm run evaluate:model      # Uses the configured Hyde key; bounded paid calls
```

OCR recovery requires Python with pypdf/pypdfium2 and the Tesseract binary:

```sh
python scripts/ocr-pages.py input.pdf outputs/recovered-pages.json
```

`scripts/reindex-reviewed.ts` replays the review from ignored local research artifacts. The corrected snapshot and metadata receipts are packaged source artifacts for reproducible startup; those raw local PDFs are not distributed.
