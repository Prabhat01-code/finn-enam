import reviewed from "../data/reviewed-analyses.json";
import prepared from "../data/analysis.json";
import type { DocumentRecord, Evidence } from "./domain";
import type { FinancialResults, Guidance } from "./financials";

// Prepared facts and automatically parsed tables use the same provenance boundary.
export function factCatalog(
  symbol: string,
  docs: DocumentRecord[],
  extracted: FinancialResults[],
) {
  // A scanned/partial PDF can still back a manually reviewed table. This
  // exception is tied to the exact content-hash ID in the reviewed fixture.
  const reviewedTableIds = new Set([
    ...reviewed.companies.flatMap((c) =>
      c.results.evidence.map((e) => e.documentId),
    ),
    ...prepared.results.evidence.map((e) => e.documentId),
  ]);
  const usable = (d: DocumentRecord) =>
    d.status === "extracted" ||
    (d.status === "partial" && reviewedTableIds.has(d.id));
  const source = (e: Evidence): Evidence => {
    const d = docs.find((d) => d.id === e.documentId);
    return {
      ...e,
      availableAt: d?.fetchedAt ?? e.availableAt,
      metadataStatus:
        !d || !usable(d)
          ? "conflict"
          : (d.metadata?.status ?? e.metadataStatus),
      revision: d?.revision,
    };
  };
  const row = reviewed.companies.find((c) => c.symbol === symbol);
  const active = new Set(
    docs
      .filter((d) => usable(d) && d.metadata?.status !== "conflict")
      .map((d) => d.id),
  );
  const tables: FinancialResults[] = [
    ...extracted,
    ...(row ? [row.results] : []),
    ...(symbol === "INFY" ? [prepared.results] : []),
  ]
    .filter((r) => r.evidence.every((e) => active.has(e.documentId)))
    .map((r) => ({ ...r, evidence: r.evidence.map(source) }));
  const guidance: Guidance[] = row
    ? [
        {
          ...row.guidance,
          targetEvidence: source(row.guidance.targetEvidence),
          actualEvidence: row.guidance.actualEvidence
            ? source(row.guidance.actualEvidence)
            : null,
        },
      ]
    : [];
  if (symbol === "INFY") {
    for (const r of prepared.ledger.revisions)
      guidance.push({
        metric: "Revenue growth",
        scope: "Consolidated",
        basis: prepared.ledger.basis,
        unit: "percent",
        period: prepared.ledger.period,
        periodEnd: "2025-03-31",
        low: r.low,
        high: r.high,
        actual: prepared.ledger.actual,
        statementDate: r.date,
        actualStatementDate: "2025-04-17",
        speaker: r.speaker,
        status: "comparable",
        note: "Selects the latest date-eligible revision of one annual target. Earlier revisions remain in the source history.",
        targetEvidence: source(r.evidence),
        actualEvidence: source(prepared.ledger.actualEvidence),
      });
  }
  return { tables, guidance };
}
