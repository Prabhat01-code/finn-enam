# FINN — covering writeup

I built FINN with coding assistance from Codex: a mobile-friendly portfolio inbox and company-research workspace that connects market events to primary evidence. It combines real NSE disclosures, annual reports and earnings-call transcripts with cited answers, management-guidance comparisons, quarterly change cards and automatic company pages.

I chose React/TypeScript, Cloudflare Workers and D1 for a cohesive deployment. GLM 5.3 Flash through Hyde handles narrative synthesis; financial calculations run in code. Historical cutoffs, inspectable citations and explicit coverage gaps prioritize traceability over apparently complete answers. Keyword search remains the default because a small development benchmark did not establish an overall benefit from hybrid retrieval.

I deliberately left out trading recommendations, exhaustive market coverage, hosted OCR and notifications. Next, I would expand independent human-reviewed evaluations, improve financial-table extraction and source coverage, and add faster background processing with stronger operational monitoring. The repository includes setup instructions, tests and verification records; I will share the development chat separately.
