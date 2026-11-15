# Verification record

The current release's checks and limits are in [RELEASE-2026-11-15.md](RELEASE-2026-11-15.md) and `release-evaluation.json`. Earlier audits, failed comparisons and benchmark results remain in the dated documents and `evaluation-history/` for traceability.

The release passed 67 deterministic tests, TypeScript, lint, API isolation/workflow checks and expired-lease recovery. Two fresh local narrative checks reached Hyde and returned supported answers: an Infosys business overview and a generated two-call demand/risk comparison. Havells completed source collection without browser steps and produced consolidated quarterly facts. Retrieval was measured on a fixed 12-case development set; hybrid remains disabled.

The production build, exact deployed commit/version, anonymous live model check, protected worker/readback, responsive browser checks, schedule state and archive secret scan are recorded in [PRODUCTION-VERIFICATION.json](PRODUCTION-VERIFICATION.json), also supplied with the source ZIP. A deployment success is not by itself proof of model generation or a scheduled run.

The Site remains public. Earlier descriptions of it as private were incorrect. GitHub source publication is now complete at [Prabhat01-code/finn-enam](https://github.com/Prabhat01-code/finn-enam), after installing the connector for the repository. Earlier dated notes preserve the prior access failure. No submission email was sent.

## GitHub publication verification

On 15 November 2026, all 214 published files at commit `c787beb34df303f6eeca34eb54a931d25cddaaaa` matched the prepared source by Git blob SHA and file mode. That file count records the initial publication, before subsequent submission-document changes. The repository includes setup instructions, the covering writeup, demo guide and production receipt. Local credentials and generated outputs are excluded from the repository.

A fresh public clone of that commit passed `npm ci`, `npm run lint`, `npm run typecheck`, all 67 tests with `npm test`, `npm run build`, and `npm run db:migrate` on macOS with Node.js 25.2.1. No `.dev.vars` or model credentials were present. The local database command required loopback access, which the execution sandbox initially blocked; it passed after that access was allowed. These checks do not establish Linux or Node.js 24 compatibility independently.

The [first GitHub Actions run](https://github.com/Prabhat01-code/finn-enam/actions/runs/43728202453) did not start any job steps because of an account-level runner restriction. Hosted CI has therefore **not passed**. Resolve the account restriction and rerun the workflow to obtain a hosted result. The subsequent documentation-only update uses `[skip ci]`; it does not change application code or the live deployment.
