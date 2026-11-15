export type MetadataReceipt = {
  field: string;
  value: string;
  page: number;
  text: string;
};
export type SourceMetadata = {
  status: "verified" | "unverified" | "conflict";
  documentDate?: string;
  callDate?: string;
  periodEnd?: string;
  discoveredPeriod: string;
  receipts: MetadataReceipt[];
  warnings: string[];
};
const months = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const datePattern =
  /\b(?:(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)|(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})),?\s+(20\d{2})\b/gi;
export function datesIn(text: string) {
  return [...text.matchAll(datePattern)]
    .map((m) => {
      const month = months.indexOf((m[2] || m[3]).toLowerCase()) + 1;
      const value = `${m[5]}-${String(month).padStart(2, "0")}-${(m[1] || m[4]).padStart(2, "0")}`;
      return { value, at: m.index!, text: m[0] };
    })
    .filter(
      (d) =>
        Number.isFinite(Date.parse(d.value)) &&
        new Date(d.value).toISOString().slice(0, 10) === d.value,
    );
}
export function reconcileMetadata(
  pages: string[],
  type: string,
  discoveredPeriod: string,
): SourceMetadata {
  const receipts: MetadataReceipt[] = [];
  for (const [index, raw] of pages.slice(0, 3).entries()) {
    const text = raw.replace(/\s+/g, " ").replace(/20(\d)\s+(\d)\b/g, "20$1$2");
    for (const date of datesIn(text)) {
      const before = text.slice(Math.max(0, date.at - 160), date.at);
      const excerpt = text.slice(
        Math.max(0, date.at - 160),
        date.at + date.text.length + 80,
      );
      let field: string | undefined;
      if (index === 0 && date.at < 650 && !/ended\s*$/i.test(before))
        field = "documentDate";
      if (/(?:quarter|year|period|half.year)\s+ended\s*$/i.test(before))
        field = "periodEnd";
      if (
        type === "transcript" &&
        /(?:call|conference|meeting).{0,110}(?:held|conducted|on|dated)\s*$/i.test(
          before,
        )
      )
        field = "callDate";
      if (
        type === "transcript" &&
        index === 1 &&
        date.at < 450 &&
        /earnings|conference|transcript/i.test(before)
      )
        field = "callDate";
      if (field && !receipts.some((r) => r.field === field))
        receipts.push({
          field,
          value: date.value,
          page: index + 1,
          text: excerpt,
        });
    }
  }
  const value = (field: string) =>
    receipts.find((r) => r.field === field)?.value;
  const callDate = value("callDate"),
    labelYear = discoveredPeriod.match(/20\d{2}/)?.[0];
  const conflict =
    !!callDate && !!labelYear && callDate.slice(0, 4) !== labelYear;
  return {
    status: conflict ? "conflict" : receipts.length ? "verified" : "unverified",
    documentDate: value("documentDate"),
    callDate,
    periodEnd: value("periodEnd"),
    discoveredPeriod,
    receipts,
    warnings: [
      ...(conflict
        ? [
            "Discovery label disagrees with the date inside the primary document.",
          ]
        : []),
      "A document/letter date is not independently verified exchange publication time.",
    ],
  };
}
export function canonicalTitle(
  type: string,
  metadata: SourceMetadata,
  fallback: string,
) {
  if (type === "transcript" && metadata.callDate)
    return `Earnings-call transcript · ${new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(metadata.callDate))}`;
  return fallback;
}
