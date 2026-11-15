import assert from "node:assert/strict";
const origin = process.env.FINN_ORIGIN ?? "http://127.0.0.1:5173";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw new Error("Use local preview.");
async function api(path, body, status = 200) {
  const r = await fetch(origin + "/api/" + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  assert.equal(r.status, status, JSON.stringify(d));
  return d;
}
const c = await api("comparison?symbol=INFY");
assert.equal(c.pair.earlier.date, "2026-07-23");
assert.equal(c.pair.later.date, "2026-10-23");
assert.equal(new Set(c.evidence.map((p) => p.documentId)).size, 2);
assert.ok(
  c.evidence.every(
    (p) => p.speakerRole !== "analyst" && p.speakerRole !== "moderator",
  ),
);
await api(
  "comparison",
  { symbol: "INFY", earlierId: c.pair.later.id, laterId: c.pair.earlier.id },
  400,
);
await api(
  "comparison",
  { symbol: "INFY", earlierId: c.pair.earlier.id, laterId: c.pair.earlier.id },
  400,
);
await api("comparison", { symbol: "INFY", focus: "invent" }, 400);
await api("comparison?symbol=NOT_REAL", undefined, 400);
const absent = await api("comparison", {
  symbol: "INFY",
  asOf: "2020-01-01T00:00:00Z",
  focus: "guidance",
});
assert.equal(absent.pair, null);
assert.equal(absent.modelError.code, "comparison_coverage");
assert.equal(absent.synthesis, null);
console.log(
  "PASS: paired context, dates, analyst exclusion, invalid/reversed/same pairs, invalid focus, unknown company, historical abstention without model calls.",
);
