# FINN — covering writeup

FINN is a responsive portfolio attention inbox connected to company research. It helps an investor move from a filing or market observation to the primary documents behind it, distinguish management guidance from reported outcomes, and inspect the evidence supporting an answer. The prototype uses an 18-company mock portfolio with real disclosures and market observations, while allowing research on other NSE companies.

## What I built

The inbox categorizes filings and evaluates configurable price and volume rules. Research discovers annual reports, earnings-call transcripts and results filings, then saves searchable page-level evidence. Company pages combine business excerpts, available financial figures, guidance and coverage gaps. Quarterly change cards expose before/after figures and supporting receipts. Persisted background jobs continue without an open browser; an hourly cloud schedule advances queued work and refreshes portfolios whose owners opted in.

GLM 5.3 Flash through Hyde generates narrative answers with inspectable citations. Numerical questions and guidance outcomes use comparable source facts and calculations in code. The prepared Infosys example follows four FY25 guidance revisions and the matched actual; Polycab and HCLTech show completed capex and acquisition-basis distinctions. Havells demonstrates collection and financial-table extraction beyond those reviewed examples.

## Decisions and tradeoffs

I retained React/TypeScript with Cloudflare Workers and D1 to keep the interface, API and deployment cohesive. A dated demonstration snapshot makes evaluation repeatable; live refreshes remain separate. Source URLs, hashes, page numbers and availability dates travel with the evidence. Historical cutoffs exclude later information, and unfamiliar or ambiguous tables remain unavailable.

The model can propose claims but cannot replace deterministic calculations. Schema, quote, number and attribution checks, one bounded repair and a separate support review reduce errors at the cost of extra latency and model calls. They do not prove that every inference is correct. Reviewed examples are labelled separately from generated research.

I implemented and measured optional hybrid retrieval, but kept keyword search active. On the small 12-case development set, improved keyword and hybrid search each recovered all required evidence in 11 cases, with different misses. That is insufficient evidence of a general hybrid advantage. Model keys remain server-side; quotas and evidence-sensitive caches bound prototype usage.

## Deliberately left out

The prototype does not trade, recommend portfolio weights or assign management credibility scores. It does not claim exhaustive exchange coverage, universal financial-table extraction, automatic verification of every company's guidance, hosted OCR, or email/push delivery. The hosted scheduler permits hourly execution, so newly queued work can wait for its next run. A FastAPI migration was excluded because it would not improve the demonstrated workflow.

## What I would build next

First, I would expand the independent, human-reviewed evaluation set across companies, periods and table layouts, measuring unsupported claims and missed evidence as well as retrieval. Next, I would improve exchange reconciliation, table/OCR coverage and a review workflow for proposed financial facts. Finally, I would add a dedicated durable queue with faster execution, operational monitoring and broader public-use controls, then enable semantic retrieval only if that larger evaluation justifies it.

The repository includes setup instructions, tests, dated evaluation records, production verification and a clearly scoped export of the actual AI-assisted development conversation. No submission email has been sent.
