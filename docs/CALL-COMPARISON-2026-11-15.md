# Evaluation expansion and call comparison — local revision

The hosted private version remains unchanged. This work is available in the local source and `FINN-source-next.zip`; it has not been published to GitHub or submitted.

## Delivered

- A **What changed?** research tab with earlier/later call selection, three topic choices, paired quotes, speaker attribution, page links, coverage gaps and a shareable company/tab URL. Quotes appear side by side on desktop and stack on phones.
- Five source-reviewed observations across three prepared companies. Infosys: lower revenue guidance and retained margin guidance. HCLTech: an acquisition-basis change, plus unchanged margin guidance. Polycab: quarterly FMEG EBIT-margin improvement, explicitly distinct from a future EBITDA target.
- These exact source pairs use a labelled reviewed path with zero model requests. Other eligible pairs/topics use GLM through the existing bounded generation, repair, support-review, cache and quota path. Reviewed results are never described as model-generated.
- Conservative call selection: verified distinct call dates, publication/retrieval eligibility, no investor-day substitution, no duplicate mirror as a prior call, no arbitrary or reversed pair. Unresolved dates are disclosed.
- Corrected colon-free speaker parsing and participant-list leakage, including the real Infosys management guidance passages. Reindexed 32 available source artifacts; the snapshot now contains 5,244 passages. Historical publication dates were not inferred from call dates.
- Fixed false rejections of verified date attribution and contextual guidance quotes. Existing tests still reject swapped metric values, invented dates, forecast-as-actual and wrong speakers. Comparison repair now keeps both calls in each claim.

## Evaluation and the resulting design

CERA was newly collected through the normal application pipeline: one annual report and four transcripts. DIXON uses its previously collected large annual report. Neither is a prepared financial-analysis example. Expected facts explicitly distinguish product categories from formal Ind AS operating segments, with primary page references.

The eight added workflow cases are:

| Cases | Evidence/result type |
| --- | --- |
| DIXON formal operating segment; CERA formal operating segments; an instruction-injection/fabricated-dividend question | Three observed model responses, expected facts or abstention asserted |
| Infosys guidance revision/reaffirmation; HCL acquisition basis; Polycab EBIT versus EBITDA | Three deterministic source-reviewed comparisons, both source identifiers asserted |
| CERA before any eligible source; CERA with unverified call dates | Two guards that withhold generation without a provider request |

All eight retained observations pass their explicit assertions. This is **not eight successful generative-comparison tests or a general accuracy percentage**. Runs are incremental and carry observation times and versions. The earlier seven-case model report remains a historical baseline, not a rerun of this revision.

Live generated-comparison experiments exposed a weakness that quotation matching alone cannot solve: the model could attach an unrelated earlier excerpt or mix acquisition assumptions with margin claims. The earlier failed/partial responses remain in `docs/evaluation-history/extended-before-paired-review.json`. Generated Infosys comparisons did produce the reviewed revision and reaffirmation, but difficult HCL comparisons were unreliable. The final product therefore serves the checked observations for these prepared pairs and tightens generated comparison gates: identified management speakers, one metric per claim, both source IDs, no claimed change based on an absent counterpart. Generic generated comparisons still need human judgment and can abstain.

Token totals in the report describe retained observations only; repeated and failed experiments incurred additional calls. The local prototype reached its normal daily allowance during verification. A temporary server-only limit of 110 was used for bounded development and removed afterwards; the default remains 100 global / 30 per visitor per UTC day. No hosted limits or secrets changed.

## Verification

- All **49 deterministic tests**, scoped lint, TypeScript and the production build passed for this revision.
- Deterministic tests cover reviewed source identity, stale/foreign/reversed pairs, unknown publication availability, analyst exclusion, participant-list leakage, valid/invalid date attribution, one-sided claims, fiscal/metric bases, repair behavior and existing app regressions.
- Local integration checks cover the comparison API plus the existing isolated visitor, empty portfolio and 520 concurrent read updates.
- Desktop and phone browser checks verified the final HCL reviewed result, both source links and the selected tab after reload. The phone layout stacks both quotes and fits the viewport.
- No hosted deployment or schedule was activated.

## Reproduce

Run the application locally, discover DIXON and CERA if their documents are absent, then run `npm run evaluate:extended`. Paid cases use the configured Hyde key and the same app limits. Select case IDs as arguments to rerun only relevant cases; selected runs merge observations transparently. Repeat tests for source-reviewed pairs do not call the model.

`data/call-comparison-review.json` contains the reviewed observations and exact primary-page receipts. `scripts/reindex-passages.ts` can replay locally retained extraction artifacts without overwriting the separate metadata review. Ignored raw PDFs and local runtime databases are not in the source archive.
