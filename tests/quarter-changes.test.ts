import test from "node:test";
import assert from "node:assert/strict";
import snapshot from "../data/snapshot.json";
import reviewed from "../data/reviewed-analyses.json";
import prepared from "../data/analysis.json";
import type { DocumentRecord } from "../lib/domain";
import { quarterChanges } from "../lib/quarter-changes";
import { factCatalog } from "../lib/fact-catalog";
const docs = snapshot.documents as DocumentRecord[];
const at = "2026-11-15T23:59:59Z";
test("a manually reviewed scanned table remains usable only at its exact source hash", () => {
  assert.equal(factCatalog("HCLTECH", docs, []).tables.length, 1);
  const altered = docs.map((d) =>
    d.id === "doc-f84f09361ca35e7d2913" ? { ...d, id: "replacement-hash" } : d,
  );
  assert.equal(factCatalog("HCLTECH", altered, []).tables.length, 0);
});
test("quarter cards align reviewed commentary to the same fiscal quarters", () => {
  const h = quarterChanges(
    "HCLTECH",
    [reviewed.companies[1].results],
    docs,
    at,
  );
  assert.equal(h.status, "supported");
  assert.ok(
    h.items
      .find((i) => /revenue growth guidance/.test(i.title))
      ?.relevance.includes("acquisition"),
  );
  assert.equal(h.items.length, 5);
  const old = quarterChanges("INFY", [prepared.results], docs, at);
  assert.equal(
    old.status,
    "numbers_only",
    "FY27 calls must not explain FY25 numbers",
  );
});
test("quarter cards use pp/bps, respect as-of, and never pad missing evidence", () => {
  const p = quarterChanges(
    "POLYCAB",
    [reviewed.companies[0].results],
    docs,
    at,
  );
  assert.match(
    p.items.find((i) => i.title === "EBITDA margin")!.difference,
    /percentage points.*bps/,
  );
  assert.equal(
    quarterChanges(
      "POLYCAB",
      [reviewed.companies[0].results],
      docs,
      "2026-10-01",
    ).items.length,
    0,
  );
  assert.equal(
    quarterChanges("UNKNOWN", [], [], at).status,
    "insufficient_evidence",
  );
});
test("replaced primary document invalidates prepared fact tables", () => {
  const id = reviewed.companies[0].results.evidence[0].documentId;
  const active = docs.filter((d) => d.id !== id);
  assert.equal(factCatalog("POLYCAB", active, []).tables.length, 0);
});
