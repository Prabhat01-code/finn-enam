import { mkdir, readFile, writeFile } from "node:fs/promises";
const origin = process.env.FINN_ORIGIN || "http://127.0.0.1:5173";
const cases = [
  {
    id: "guidance-actual",
    symbol: "INFY",
    question:
      "What was the final FY25 revenue growth guidance and what was the actual full-year growth? State the reporting basis.",
    asOf: "2025-04-23T00:00:00Z",
    expected:
      "Cites final 4.5–5% and actual 4.2%, both constant currency; separates expectations from actuals.",
  },
  {
    id: "historical-cutoff",
    symbol: "INFY",
    question: "What was the FY25 revenue growth guidance?",
    asOf: "2024-06-01T00:00:00Z",
    expected:
      "Uses only the initial 1–3% target; no later revisions or actual result.",
  },
  {
    id: "business-tcs",
    symbol: "TCS",
    question: "What does the company do and how does it earn revenue?",
    expected: "Cited business explanation using TCS documents.",
  },
  {
    id: "capacity-polycab",
    symbol: "POLYCAB",
    question:
      "What does management say about capacity expansion and capital expenditure?",
    expected:
      "Cited management statements; does not equate an investment plan with completed capacity.",
  },
  {
    id: "generic-asianpaint",
    symbol: "ASIANPAINT",
    question: "What are the business segments and key risks?",
    expected:
      "Uses the same retrieval and synthesis pipeline for a company outside the prepared portfolio.",
  },
  {
    id: "plausible-unsupported",
    symbol: "INFY",
    question:
      "What exact dividend per share has the board approved for FY2035?",
    expected: "Abstains: no approved FY2035 dividend in the supplied evidence.",
  },
  {
    id: "unsupported-premise",
    symbol: "INFY",
    question:
      "What was the revenue of the company’s mining operations on Mars in FY25?",
    expected: "Abstains; no invented Mars operations or revenue.",
  },
];
let results = [];
let cookie = "";
async function request(body) {
  const r = await fetch(origin + "/api/answer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const next = r.headers.get("set-cookie");
  if (next) cookie = next.split(";")[0];
  return r;
}
function assess(id, result) {
  const text = result.claims.map((c) => c.text).join(" "),
    checks = {
      hasAnswer: result.status === "answered" && result.claims.length > 0,
    };
  if (id === "guidance-actual") {
    checks.target = /4\.5/.test(text) && /5%/.test(text);
    checks.actual = /4\.2/.test(text);
    checks.basis = /constant.currency/i.test(text);
  }
  if (id === "historical-cutoff") {
    checks.initial = /1%?\s*(?:to|[–-])\s*3%/.test(text);
    checks.noLaterNumbers = !/4\.5|4\.2|3\.75/.test(text);
  }
  if (id === "business-tcs")
    checks.business = /IT services|consulting|business solutions/i.test(text);
  if (id === "capacity-polycab")
    checks.capacity = /capex|capital expenditure|capacity/i.test(text);
  if (id === "generic-asianpaint")
    checks.segments = /decorative|industrial|paint/i.test(text);
  if (id === "unsupported-premise" || id === "plausible-unsupported") {
    delete checks.hasAnswer;
    checks.abstains =
      result.status === "insufficient_evidence" && result.claims.length === 0;
  }
  checks.noAnalystAsManagement = !result.claims.some(
    (c) =>
      /management (?:said|mentioned|guided|reported)/i.test(c.text) &&
      c.citations.every((x) => x.evidence.speakerRole === "analyst"),
  );
  return { checks, passed: Object.values(checks).every(Boolean) };
}

const selected = process.argv.slice(2);
for (const item of cases.filter(
  (c) => !selected.length || selected.includes(c.id),
)) {
  const { id, expected, ...input } = item;
  const started = Date.now();
  const response = await request(input);
  const body = await response.json();
  const result = {
    observedAt: new Date().toISOString(),
    id,
    input,
    expected,
    http: response.status,
    modelError: body.modelError ?? null,
    status: body.synthesis?.status ?? "no_synthesis",
    claims: body.synthesis?.claims ?? [],
    gaps: body.synthesis?.gaps ?? [],
    validation: body.synthesis?.validation ?? null,
    usage: body.synthesis?.usage ?? null,
    evidenceCount: body.evidence?.length ?? 0,
    allEvidenceWithinCutoff:
      !input.asOf ||
      body.evidence?.every(
        (p) =>
          Date.parse(p.publishedAt ?? p.availableAt) <= Date.parse(input.asOf),
      ),
    durationMs: Date.now() - started,
  };
  result.quality = assess(id, result);
  results.push(result);
  console.log(
    JSON.stringify({
      id,
      status: result.status,
      error: result.modelError?.code,
      claims: result.claims.map((c) => c.text),
      validation: result.validation,
      usage: result.usage,
      cutoff: result.allEvidenceWithinCutoff,
    }),
  );
}
const first = cases[0];
const response = await request({
  symbol: first.symbol,
  question: first.question,
  asOf: first.asOf,
});
const cached = await response.json();
await mkdir("docs", { recursive: true });
if (selected.length) {
  try {
    const prior = JSON.parse(
      await readFile("docs/model-evaluation.json", "utf8"),
    );
    results = [
      ...prior.results.filter((r) => !selected.includes(r.id)),
      ...results,
    ];
  } catch {}
}
await writeFile(
  "docs/model-evaluation.json",
  JSON.stringify(
    {
      runAt: new Date().toISOString(),
      model: "hyde/glm-5.3-flash",
      provider: "Hyde",
      note: "Transport, date boundaries, explicit expected-fact assertions and a separate claim-support review. Semantic correctness still needs human review; this is not a general accuracy benchmark.",
      cacheReused: cached.synthesis?.cached === true,
      results,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    cacheReused: cached.synthesis?.cached === true,
    report: "docs/model-evaluation.json",
  }),
);
if (
  results.some(
    (r) =>
      r.http !== 200 ||
      r.modelError ||
      !r.allEvidenceWithinCutoff ||
      !r.quality.passed,
  ) ||
  cached.synthesis?.cached !== true
)
  process.exitCode = 1;
