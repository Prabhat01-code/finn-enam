import test from "node:test";
import assert from "node:assert/strict";
import {
  planQuestion,
  numericalAnswer,
  guidanceAnswer,
  quarterKey,
} from "../lib/question-plan";
import { factCatalog } from "../lib/fact-catalog";
import prepared from "../data/analysis.json";
import reviewed from "../data/reviewed-analyses.json";
import type { FinancialResults } from "../lib/financials";
import snapshot from "../data/snapshot.json";
import type { DocumentRecord } from "../lib/domain";

const at = "2026-11-15T23:59:59Z";
const calc = (q: string, table: FinancialResults = prepared.results) =>
  numericalAnswer(planQuestion("INFY", q, at), [table]);
test("router separates numerical, explanatory, guidance and narrative requests", () => {
  for (const [q, intent] of [
    ["What was revenue growth?", "numerical"],
    ["Why did EBITDA margins fall?", "explanation"],
    ["Did management meet guidance?", "guidance"],
    ["What is the business?", "narrative"],
  ])
    assert.equal(planQuestion("INFY", q, at).intent, intent);
});
test("ambiguous growth returns QoQ and YoY from reported inputs, no model", () => {
  const r = calc("What was revenue growth?");
  assert.equal(r.status, "answered");
  assert.equal(r.calculations.length, 2);
  assert.ok(
    Math.abs(r.calculations[0].value! - ((40925 - 41764) / 41764) * 100) <
      1e-10,
  );
  assert.ok(r.calculations[1].value! > 0);
});
test("period, basis, unavailable metric and historical filters fail closed", () => {
  for (const q of [
    "What was Q2 FY27 revenue growth?",
    "What was standalone revenue growth?",
    "What was EBITDA growth?",
    "What was revenue growth in constant currency?",
    "What was FY25 revenue growth?",
    "What was H1 revenue growth?",
  ])
    assert.equal(calc(q).status, "insufficient_evidence", q);
  const plan = planQuestion("INFY", "What was revenue growth?", "2025-04-01");
  assert.equal(
    numericalAnswer(plan, [prepared.results]).status,
    "insufficient_evidence",
  );
});
test("margin differences use percentage points and reject unspecified margin", () => {
  const t = reviewed.companies[0].results;
  const r = calc("What was EBITDA margin change QoQ?", t);
  assert.equal(r.calculations[0].unit, "percentage points");
  assert.ok(
    Math.abs(r.calculations[0].value! - (14225 / 98989 - 11362 / 82097) * 100) <
      1e-10,
  );
  assert.equal(
    calc("Why did margins fall?", t).status,
    "insufficient_evidence",
  );
  assert.equal(calc("Why did revenue fall QoQ?", t).premise, "contradicted");
});
test("zero/negative bases and nonconsecutive quarters cannot produce false growth", () => {
  const t = structuredClone(prepared.results);
  t.metrics[0].previous = 0;
  assert.equal(
    calc("What was revenue growth QoQ?", t).calculations[0].value,
    null,
  );
  t.previousLabel = "SEP 2024";
  assert.equal(calc("What was revenue growth QoQ?", t).calculations.length, 0);
  assert.equal(quarterKey("2026-09-30"), "Q2 FY27");
});
test("guidance revisions select the latest available promise and hide future actuals", () => {
  const g = factCatalog(
    "INFY",
    snapshot.documents as DocumentRecord[],
    [],
  ).guidance;
  const earlier = guidanceAnswer(
    planQuestion(
      "INFY",
      "Did management meet FY25 revenue guidance?",
      "2024-08-01",
    ),
    g,
  );
  assert.equal(earlier.guidance?.target, "3–4 percent");
  assert.equal(earlier.guidance?.actual, null);
  assert.equal(earlier.guidance?.outcome, "pending");
  const final = guidanceAnswer(
    planQuestion("INFY", "Did management meet FY25 revenue guidance?", at),
    g,
  );
  assert.equal(final.guidance?.outcome, "missed");
  assert.equal(final.guidance?.target, "4.5–5 percent");
  assert.equal(
    guidanceAnswer(
      planQuestion("INFY", "Did management meet FY27 revenue guidance?", at),
      g,
    ).status,
    "insufficient_evidence",
  );
});
test("unsupported compound metrics and USD guidance do not silently change the question", () => {
  assert.equal(
    calc("What was revenue and PAT growth?").status,
    "insufficient_evidence",
  );
  const g = factCatalog(
    "INFY",
    snapshot.documents as DocumentRecord[],
    [],
  ).guidance;
  assert.equal(
    guidanceAnswer(
      planQuestion("INFY", "What was FY25 revenue guidance in USD?", at),
      g,
    ).status,
    "insufficient_evidence",
  );
});
