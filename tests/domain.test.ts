import test from "node:test";
import assert from "node:assert/strict";
import {
  classify,
  growth,
  normalizeUnit,
  compareGuidance,
  marketStats,
  completedSession,
  searchPassages,
  makeAlertId,
  type Bar,
  type Evidence,
} from "../lib/domain";
import { validateUrl, nseTime } from "../lib/collectors";
import fixture from "../data/analysis.json";
test("reported results, meeting notices and newspaper notices have different priorities", () => {
  assert.equal(
    classify("Financial Results", "Quarter ended September 30").priority,
    "high",
  );
  assert.equal(classify("Board Meeting Intimation").subtype, "meeting_notice");
  assert.equal(
    classify("Newspaper Publication", "Unaudited financial results").priority,
    "routine",
  );
});
test("downgrades and auditor departures stay visible; unknown does not mean routine", () => {
  assert.equal(classify("Credit rating downgraded").priority, "high");
  assert.equal(classify("Credit rating reaffirmed").priority, "routine");
  assert.equal(classify("Auditor resignation").priority, "high");
  assert.equal(classify("Unusual disclosure").subtype, "needs_review");
});
test("growth abstains on zero/negative bases and units normalize to INR crore", () => {
  assert.equal(growth(10, 0), null);
  assert.equal(growth(10, -5), null);
  assert.equal(growth(NaN, 1), null);
  assert.ok(Math.abs(growth(110, 100)! - 10) < 1e-8);
  assert.equal(normalizeUnit(100, "lakh"), 1);
  assert.equal(normalizeUnit(10, "million"), 1);
  assert.equal(normalizeUnit(1, "billion"), 100);
});
const claim = {
  metric: "revenue_growth",
  basis: "constant_currency",
  scope: "consolidated",
  period: "FY25",
  end: "2025-03-31",
  low: 4.5,
  high: 5,
};
test("annual target remains pending midyear, then matches the comparable actual", () => {
  assert.equal(
    compareGuidance(claim, { ...claim, value: 4.2 }, "2025-02-01").status,
    "pending",
  );
  const result = compareGuidance(claim, { ...claim, value: 4.2 }, "2025-04-22");
  assert.equal(result.status, "missed");
  assert.ok(Math.abs(result.difference! + 0.3) < 1e-8);
});
test("unlike reporting basis, entity scope, and quarter/YTD periods are rejected", () => {
  for (const patch of [
    { basis: "reported_usd" },
    { scope: "standalone" },
    { period: "Q4 FY25" },
    { metric: "ebitda" },
  ])
    assert.equal(
      compareGuidance(claim, { ...claim, ...patch, value: 4.2 }, "2025-04-22")
        .status,
      "not_comparable",
    );
});
test("volume baseline excludes current session and requires 20 valid prior sessions", () => {
  const bars: Bar[] = Array.from({ length: 21 }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, "0")}`,
    close: 100 + i,
    adjustedClose: 100 + i,
    volume: i === 20 ? 200 : 100,
  }));
  assert.equal(marketStats(bars).volumeRatio, 2);
  assert.equal(marketStats(bars.slice(1)).volumeRatio, null);
  assert.equal(
    marketStats(bars.map((b) => ({ ...b, volume: 0 }))).volumeRatio,
    null,
  );
  const split = bars.map((b, i) => ({ ...b, split: i === 20 }));
  assert.equal(marketStats(split).change, null);
  assert.equal(marketStats(split).volumeRatio, null);
});
test("incomplete EOD observations are excluded without inventing weekend sessions", () => {
  assert.equal(
    completedSession("2026-11-13", new Date("2026-11-13T09:00:00Z")),
    false,
  );
  assert.equal(
    completedSession("2026-11-13", new Date("2026-11-13T11:00:00Z")),
    true,
  );
  assert.equal(
    completedSession("2026-11-16", new Date("2026-11-15T11:00:00Z")),
    false,
  );
});
test("source timestamps are converted from India time, not the host timezone", () => {
  assert.equal(nseTime("2026-11-13 16:00:00"), "2026-11-13T10:30:00.000Z");
  assert.equal(nseTime("13-Nov-2026 16:00:00"), "2026-11-13T10:30:00.000Z");
});
test("URL guard prevents private destinations and unverified source hosts", () => {
  for (const url of [
    "http://www.nseindia.com/a",
    "https://127.0.0.1/a",
    "https://localhost/a",
    "https://www.nseindia.com.attacker.com/a",
    "https://u:p@www.nseindia.com/a",
    "https://169.254.169.254/a",
  ])
    assert.throws(() => validateUrl(url));
  assert.equal(
    validateUrl("https://nsearchives.nseindia.in/corporate/a.pdf").hostname,
    "nsearchives.nseindia.in",
  );
  assert.throws(() => validateUrl("https://127.0.0.1/a", "127.0.0.1"));
});
test("historical search excludes future and undated evidence not yet retrieved", () => {
  const base: Evidence = {
    documentId: "synthetic",
    title: "Synthetic test",
    url: "https://example.com",
    page: 1,
    text: "Revenue guidance is a synthetic test.",
    publishedAt: "2025-01-10",
    type: "transcript",
  };
  const found = searchPassages(
    "revenue guidance",
    [
      base,
      { ...base, documentId: "future", publishedAt: "2025-03-01" },
      {
        ...base,
        documentId: "undated",
        publishedAt: null,
        availableAt: "2026-11-15",
      },
    ],
    "2025-02-01",
  );
  assert.deepEqual(
    found.map((x) => x.documentId),
    ["synthetic"],
  );
  assert.equal(searchPassages("weather banana", [base]).length, 0);
});
test("repeated event/rule/session produces the same stable alert identity", () => {
  assert.equal(
    makeAlertId("INFY", "price", "2026-11-13"),
    makeAlertId("INFY", "price", "2026-11-13"),
  );
  assert.notEqual(
    makeAlertId("INFY", "price", "2026-11-13"),
    makeAlertId("INFY", "volume", "2026-11-13"),
  );
});
test("real Infosys fixture preserves the evolving target and dated source receipts", () => {
  const l = fixture.ledger;
  assert.equal(l.revisions.length, 4);
  assert.deepEqual(
    l.revisions.map((r) => [r.low, r.high]),
    [
      [1, 3],
      [3, 4],
      [3.75, 4.5],
      [4.5, 5],
    ],
  );
  assert.equal(l.actual, 4.2);
  assert.equal(
    compareGuidance(
      { ...claim, low: 1, high: 3 },
      { ...claim, value: l.actual },
      "2025-04-22",
    ).status,
    "exceeded",
  );
  for (const r of l.revisions) {
    assert.ok(r.evidence.url.startsWith("https://www.bseindia.com/"));
    assert.ok(r.evidence.publishedAt > r.date);
    assert.ok(r.evidence.page > 0);
  }
});
