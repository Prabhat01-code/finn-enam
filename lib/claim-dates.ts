import type { Evidence } from "./domain";
// Remove only date phrases independently established by the cited source. Their
// day/month numbers are attribution, not a revenue/margin/target amount.
export function withoutVerifiedDates(text: string, sources: Evidence[]) {
  for (const source of sources) {
    for (const value of [source.sourceDate, source.publishedAt]) {
      if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) continue;
      const iso = value.slice(0, 10),
        date = new Date(iso + "T12:00:00Z");
      if (!Number.isFinite(date.getTime())) continue;
      const year = date.getUTCFullYear(),
        day = date.getUTCDate();
      const month = date.toLocaleString("en-US", {
        month: "long",
        timeZone: "UTC",
      });
      const short = date.toLocaleString("en-US", {
        month: "short",
        timeZone: "UTC",
      });
      const patterns = [
        iso,
        `(?:${month}|${short})\\.?\\s+${day}(?:st|nd|rd|th)?(?:,?\\s+${year})?`,
        `${day}(?:st|nd|rd|th)?\\s+(?:${month}|${short})\\.?(?:,?\\s+${year})?`,
      ];
      for (const pattern of patterns)
        text = text.replace(
          new RegExp(`\\b${pattern}\\b`, "gi"),
          "[verified date]",
        );
    }
  }
  return text;
}
