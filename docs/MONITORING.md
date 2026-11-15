# Background jobs and monitoring

The browser queues research and reads progress. A separate authenticated writer at `POST /api/worker` advances persisted work, including after the browser closes. Each call advances up to two stages and reports aggregate `advanced`, `ready` and `busy` values. A terminal research job saves its company page. Researching a company does not add it to a portfolio.

## Local runner

1. Set a random 32+ character `FINN_MONITOR_KEY` in ignored `.dev.vars`.
2. Run `npm run dev` and, in another terminal, `npm run worker`.
3. Use `npm run worker -- --once` for one bounded cycle.
4. Enable monitoring in Alert preferences for portfolios that should refresh. The worker checks subscriptions every 30 minutes.

The local machine must remain running. The older `npm run monitor` handles portfolio monitoring only. Remote runner URLs must be HTTPS; redirects are rejected.

## Hosted cloud task

A linked Sites schedule is the hosted execution mechanism. The exported Cloudflare scheduled handler alone does not create a schedule. The release activation process verifies the public writer and saved results before creating the linked schedule. The accompanying release verification receipt records the actual schedule and production observations; saving a schedule does not prove a scheduled run has occurred.

The credential-free runbook is served at `/api/worker-instructions`. A fresh cloud task reads `get_site` for the linked Site, obtains its existing service token in memory, and sends it **only to that Site** in `OAI-Sites-Authorization` and `X-FINN-Service-Authorization`. Runtime secret `FINN_SERVICE_TOKEN_SHA256` stores the token's digest. The application verifies the second header because public access alone is insufficient authorization. No token is included in source or task prompts. If the token rotates, update its digest through Sites and redeploy; authorization failures stop processing.

Each run follows the saved runbook: sequential empty-body worker calls until idle/busy, 24 cycles or four minutes; one bounded retry for transient failure; then read `/api/worker-status` to verify the persisted heartbeat. Deferred work remains queued. The task does not generate answers, alter subscriptions or select private visitor data. Monitoring reads public NSE/Yahoo/company sources only. Sites permits at most one scheduled run per hour. The enabled schedule runs hourly at :30 in Asia/Kolkata; a newly queued job may wait until the next run. `FINN_WORKER_INTERVAL_MINUTES=60` makes that wait visible in the queue notice.

## Recovery and coverage

Concurrent creation of a user's same-type/same-company job is atomic. A global drain lease prevents overlapping workers; each stage also has a five-minute ownership lease. Expired owners cannot overwrite newer final job state. Sources retry up to three times; partial/failed results remain explicit.

HAVELLS completed through worker calls with zero browser step requests: one annual report, four transcripts and a results filing, 748 passages. The revised parser extracted revenue, PBT and PAT from consolidated page 9. EBITDA remains unavailable. Separate recovery testing completed a queued empty-portfolio job after an expired lease, recorded in `worker-recovery-evaluation.json`.

`tests/worker-recovery.mjs --prepare` writes a test fixture only to local D1. Do not run this fixture against production. Start the worker once, then run `node tests/worker-recovery.mjs` for readback.
