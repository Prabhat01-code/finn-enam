import type { DocumentRecord } from "./domain";
import type { FinancialResults } from "./financials";
import { datesIn } from "./provenance";

// Conservative text-table path. Ambiguous headers, units or columns yield no table.
// Scanned documents use the separate local OCR/review path, never guessed values.
export function extractResults(
  document: DocumentRecord,
  pages: string[],
): FinancialResults | null {
  if (document.type !== "results") return null;
  for (const [index, text] of pages.entries()) {
    const lines = text
      .split(/\n/)
      .map((line) => line.replace(/[ \t]+/g, " ").trim());
    const header = lines.join("\n").slice(0, 2200);
    if (
      !/consolidated (?:financial )?results/i.test(header) ||
      !/quarter|three months/i.test(header)
    )
      continue;
    const unit = /\b(?:in|INR|Rs\.?)\s*crores?\b/i.test(header)
      ? "crore"
      : /\b(?:in|INR|Rs\.?)\s*million\b/i.test(header)
        ? "million"
        : null;
    if (!unit) continue;
    // Parse the column header, never the cover date or repeated YTD dates.
    // The supported layout explicitly puts three quarterly columns first.
    const columns = header.match(
      /(?:Quarter|Three months)\s+Ended([^]*?)(?=\n(?:\d+\s+)?(?:Income|Revenue))/i,
    )?.[1];
    if (!columns) continue;
    const months = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const shortDates = [
      ...columns.matchAll(
        /\b(\d{1,2})[-/.](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{1,2})[-/.](\d{4}|\d{2})\b/gi,
      ),
    ].map((m) => ({
      value: `${m[3].length === 2 ? "20" + m[3] : m[3]}-${String(/^\d/.test(m[2]) ? Number(m[2]) : months.indexOf(m[2].toLowerCase()) + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`,
      at: m.index!,
    }));
    const allDates = [...datesIn(columns), ...shortDates].sort(
      (a, b) => a.at - b.at,
    );
    const dates = allDates.slice(0, 3).map((d) => d.value);
    if (dates.length !== 3) continue;
    if (
      dates.some(
        (d) =>
          !Number.isFinite(Date.parse(d)) ||
          new Date(d).toISOString().slice(0, 10) !== d,
      )
    )
      continue;
    const days = (a: string, b: string) =>
      (Date.parse(a) - Date.parse(b)) / 86400000;
    if (
      days(dates[0], dates[1]) < 75 ||
      days(dates[0], dates[1]) > 105 ||
      days(dates[0], dates[2]) < 330 ||
      days(dates[0], dates[2]) > 400
    )
      continue;
    const labels = [
      [
        "Revenue",
        /^\s*(?:(?:\d+\.?|[a-z]\))\s*)?Revenue (?:from operations|from contracts with customers)\s*[:|]?\s*/i,
      ],
      ["EBITDA", /^\s*EBITDA\s*[:|]?\s*/i],
      ["PBT", /^\s*(?:\d+\.?\s*)?Profit before tax\s*[:|]?\s*/i],
      [
        "PAT",
        /^\s*(?:\d+\.?\s*)?Profit (?:after tax|for the (?:quarter|period))\s*[:|]?\s*/i,
      ],
    ] as const;
    const metrics = labels.map(([name, pattern]) => {
      const rows = lines.filter(
        (l) => pattern.test(l) && !/attributable/i.test(l),
      );
      if (rows.length !== 1)
        return {
          name,
          current: null,
          previous: null,
          yearAgo: null,
          note: "No unambiguous row extracted.",
        };
      const row = rows[0]
        .replace(pattern, "")
        .replace(/^\(\d+\s*[-+]\s*\d+\)\s*/, "");
      if (!/^\(?-?\d/.test(row.trim()))
        return { name, current: null, previous: null, yearAgo: null };
      const cells = row.match(/\(?-?\d[\d,]*(?:\.\d+)?\)?/g) ?? [];
      if (cells.length < 3)
        return { name, current: null, previous: null, yearAgo: null };
      const values = cells
        .slice(0, 3)
        .map(
          (v) => Number(v.replace(/[(),]/g, "")) * (v.startsWith("(") ? -1 : 1),
        );
      return {
        name,
        current: values[0],
        previous: values[1],
        yearAgo: values[2],
        ...(name === "PAT"
          ? {
              note: "Profit for the period, including non-controlling interests; not owners-attributable profit.",
            }
          : {}),
      };
    });
    if (metrics.filter((m) => m.current !== null).length < 2) continue;
    return {
      period: `Quarter ended ${dates[0]}`,
      scope: "Consolidated",
      basis:
        "Extracted text table — verify metric definitions and original columns",
      currency: "INR",
      unit,
      currentLabel: dates[0],
      previousLabel: dates[1],
      yearAgoLabel: dates[2],
      metrics,
      evidence: [
        {
          documentId: document.id,
          title: document.title,
          url: document.url,
          page: index + 1,
          text,
          publishedAt: document.publishedAt,
          availableAt: document.fetchedAt,
          type: "results",
          verbatim: true,
        },
      ],
    };
  }
  return null;
}
