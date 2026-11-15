import type { DocumentRecord, Evidence } from "./domain";
export const PASSAGE_PARSER = "unpdf-1.4.0/page-text-v5";

// Preserve late-page guidance and risk statements instead of selecting only
// the first two keyword hits (which are often overlapping revenue paragraphs).
export function extractPassages(
  document: DocumentRecord,
  pages: string[],
): Evidence[] {
  const result: Evidence[] = [];
  const opening = pages.slice(0, 3).join(" ");
  const managementNames = new Set<string>();
  const nameKey = (name: string) =>
    name
      .toLowerCase()
      .replace(/^(?:mr\.?|ms\.?|mrs\.?)\s+/i, "")
      .replace(/[^a-z]/g, "");
  for (const m of opening.matchAll(
    /([A-Z][A-Za-z.]+(?: [A-Z][A-Za-z.]+){1,3})\s*[-–:,]?\s*(?:Chief|CEO|CFO|Managing Director|Executive Director)/gi,
  ))
    managementNames.add(nameKey(m[1]));
  const speakerLine = /^(?:[A-Z][a-zA-Z.'’-]+\s+){1,3}[A-Z][a-zA-Z.'’-]+$/;
  const excluded =
    /participants|journalists|communications|document|limited|conference|results|page|financial|stock|exchange|thank|good|dear|corporate/i;
  const lines =
    document.type === "transcript"
      ? pages.flatMap((p) => p.split(/\r?\n/).map((s) => s.trim()))
      : [];
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  const names = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!speakerLine.test(line) || excluded.test(line)) continue;
    // Colon-free names must recur as standalone lines, or have an explicit
    // company role beneath them. A participant-list heading is never a turn.
    const following = lines
      .slice(i + 1, i + 4)
      .filter(Boolean)
      .join(" ");
    const role =
      /^(?:Chief|CEO|CFO|Managing Director|Executive Director|Co-Founder|Chairman|AVP|Associate Vice President|Head of Investor)/i.test(
        following,
      );
    if (role || (counts.get(line) ?? 0) > 1) names.add(line);
    if (role && !/communications/i.test(following.slice(0, 120)))
      managementNames.add(nameKey(line));
  }
  let lastSpeaker: string | undefined;

  for (let page = 0; page < pages.length; page++) {
    let text = "";
    const turns: { index: number; name: string }[] = [];
    for (const raw of pages[page].split(/\r?\n/)) {
      const line = raw.replace(/\s+/g, " ").trim();
      if (!line) continue;
      const colon = line.match(
        /^((?:[A-Z][A-Za-z.'’-]+\s+){1,3}[A-Z][A-Za-z.'’-]+|Moderator|Operator)\s*:/,
      )?.[1];
      const name =
        colon && !excluded.test(colon)
          ? colon
          : names.has(line)
            ? line
            : undefined;
      if (document.type === "transcript" && name)
        turns.push({ index: text.length + (text ? 1 : 0), name });
      text += (text ? " " : "") + line;
    }
    if (text.length < 80) continue;
    const hits = [
      ...text.matchAll(
        /guidance|outlook|cash flow|risk|borrowings|capacity|revenue|business|segment|margin|growth/gi,
      ),
    ]
      .map((m) => ({
        at: m.index ?? 0,
        weight: /guidance|outlook/i.test(m[0])
          ? 4
          : /cash flow|risk|borrowings|capacity/i.test(m[0])
            ? 3
            : 1,
      }))
      .sort((a, b) => b.weight - a.weight || a.at - b.at);
    const windows: { start: number; end: number }[] = [];
    for (const hit of hits) {
      const previousStop = text.lastIndexOf(". ", Math.max(0, hit.at - 1));
      const turn = turns.filter((t) => t.index! <= hit.at).at(-1);
      const turnStart = turn?.index ?? 0;
      const turnEnd =
        turns.find((t) => t.index! > hit.at)?.index ?? text.length;
      const start = Math.max(
        turnStart,
        previousStop >= Math.max(0, hit.at - 350)
          ? previousStop + 2
          : Math.max(0, hit.at - 180),
      );
      const limit = Math.min(turnEnd, start + 1100),
        sentenceEnd = text.lastIndexOf(". ", limit);
      const end = sentenceEnd > hit.at + 60 ? sentenceEnd + 1 : limit;
      if (
        end - start < 80 ||
        windows.some(
          (w) =>
            Math.max(0, Math.min(end, w.end) - Math.max(start, w.start)) >
            0.45 * Math.min(end - start, w.end - w.start),
        )
      )
        continue;
      windows.push({ start, end });
      if (windows.length === 3) break;
    }
    for (const w of windows.sort((a, b) => a.start - b.start)) {
      const preceding = turns.filter((t) => t.index! <= w.start).at(-1);
      const speaker = preceding?.name ?? lastSpeaker;
      const excerpt = text.slice(w.start, w.end);
      const speakerRole: Evidence["speakerRole"] = !speaker
        ? "unknown"
        : /moderator|operator/i.test(speaker)
          ? "moderator"
          : [...managementNames].some(
                (n) => n === nameKey(speaker) || n.endsWith(nameKey(speaker)),
              )
            ? "management"
            : /\?|wanted to.{0,30}understand/i.test(excerpt)
              ? "analyst"
              : "unknown";
      result.push({
        documentId: document.id,
        title: document.title,
        url: document.url,
        page: page + 1,
        text: text.slice(w.start, w.end),
        publishedAt: document.publishedAt,
        availableAt: document.fetchedAt,
        type: document.type,
        speaker,
        speakerRole,
        metadataStatus: document.metadata?.status,
        sourceDate:
          document.metadata?.status === "verified"
            ? (document.metadata.callDate ?? document.metadata.documentDate)
            : undefined,
        section:
          document.type === "transcript"
            ? "Management discussion and Q&A"
            : "Company document",
      });
    }
    // Do not carry a roster's last name into the discussion on the next page.
    if (!/CORPORATE PARTICIPANTS|MANAGEMENT\s*:|JOURNALISTS/i.test(text))
      lastSpeaker = turns.at(-1)?.name ?? lastSpeaker;
  }
  return result;
}
