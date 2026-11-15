import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extractPassages } from "../lib/passages";
import { reconcileMetadata } from "../lib/provenance";
import {
  classify,
  type DocumentRecord,
  type Evidence,
  type Filing,
} from "../lib/domain";
type Receipt = {
  documentId: string;
  canonicalTitle?: string;
  reportingPeriod?: string;
  reportingPeriodEnd?: string;
  periodEnd?: string;
  type?: string;
  documentDate?: string;
  eventDate?: string;
  callDate?: string;
  sourceUrl?: string;
  receipts?: { page: number; summary: string }[];
  corrections?: string[];
};
const read = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const data = (await read("data/snapshot.json")) as {
  documents: DocumentRecord[];
  passages: Evidence[];
  events: Filing[];
};
const directory = "outputs/audit-research/";
const reviews: Receipt[] = [
  ...(await read(directory + "INFY-TCS-metadata-receipts.json")),
  ...(await read(directory + "ASIANPAINT-metadata-receipts.json")),
  ...(await read(directory + "reviewed-financial-facts.json")).metadata,
];
const receipts = new Map(reviews.map((r) => [r.documentId, r]));
let updated = 0;
for (const d of data.documents) {
  const file = directory + d.id + ".json";
  if (!existsSync(file)) continue;
  const raw = await read(file),
    r = receipts.get(d.id),
    oldId = d.id;
  if (raw.downloadedSha256 && raw.downloadedSha256 !== d.hash) {
    d.hash = raw.downloadedSha256;
    d.id = "doc-" + d.hash.slice(0, 20);
    d.url = raw.sourceUrl;
    d.source = new URL(d.url).hostname;
  }
  const pages: string[] = raw.pages;
  d.metadata = reconcileMetadata(pages, d.type, d.period);
  if (r) {
    d.metadata = {
      ...d.metadata,
      status: "verified",
      documentDate: r.documentDate,
      callDate: r.eventDate ?? r.callDate,
      periodEnd: r.reportingPeriodEnd ?? r.periodEnd,
      receipts:
        r.receipts?.map((x) => ({
          field: "primary_document_review",
          value: r.reportingPeriod ?? "",
          page: x.page,
          text: x.summary,
        })) ?? d.metadata.receipts,
      warnings: [
        ...(r.corrections ?? []),
        "Document date verified from the primary cover; publication time remains independently unverified unless supplied by the exchange.",
      ],
    };
    d.title = r.canonicalTitle ?? d.title;
    d.type = r.type ?? d.type;
    d.period = r.reportingPeriod ?? d.period;
  }
  d.parser = "unpdf-1.4.0/page-text-v3";
  const extracted = extractPassages(d, pages);
  d.status = extracted.length ? "extracted" : "partial";
  if (extracted.length) delete d.error;
  data.passages = data.passages.filter((p) => p.documentId !== oldId);
  data.passages.push(...extracted);
  updated++;
}
const recovered = await read(directory + "HCLTECH-Q4FY26-transcript.json");
if (!data.documents.some((d) => d.id === recovered.document.id)) {
  const d: DocumentRecord = {
    ...recovered.document,
    title: "HCLTech earnings call · Apr 2026",
    period: "Q4 FY26",
    publishedAt: null,
    fetchedAt: new Date().toISOString(),
    parser: "unpdf-1.4.0/page-text-v3",
    status: "extracted",
    pages: recovered.pages.length,
    source: new URL(recovered.document.url).hostname,
    identity:
      "Issuer-hosted transcript; company and management identified in opening pages",
    metadata: reconcileMetadata(recovered.pages, "transcript", "Apr 2026"),
  };
  data.documents = data.documents.filter(
    (x) => x.id !== "failed-HCLTECH-transcript-Apr 2026",
  );
  data.documents.push(d);
  data.passages.push(...extractPassages(d, recovered.pages));
}
data.events = data.events.map((e) => ({
  ...e,
  ...classify(e.title, e.description),
}));
await writeFile("data/snapshot.json", JSON.stringify(data));
await writeFile(
  "data/metadata-review.json",
  JSON.stringify(
    {
      reviewedOn: "2026-11-15",
      note: "Primary document dates, not inferred publication dates.",
      records: reviews,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    updated,
    documents: data.documents.length,
    passages: data.passages.length,
  }),
);
