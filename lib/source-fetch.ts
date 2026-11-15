export async function fetchWithBackoff(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await fetcher(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(18000),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; FINN-research/1.0)",
          Accept: "application/json,text/html,application/pdf,*/*",
        },
      });
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
      continue;
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      const delay = Math.min(
        2000,
        Math.max(250, Number(response.headers.get("retry-after") ?? 0) * 1000),
      );
      await response.body?.cancel();
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    return response;
  }
  throw new Error("Source attempts exhausted");
}
export function canonicalSource(url: string) {
  const u = new URL(url);
  if (
    (u.hostname === "bseindia.com" || u.hostname.endsWith(".bseindia.com")) &&
    u.pathname.toLowerCase().endsWith("/annpdfopen.aspx")
  ) {
    const name = u.searchParams.get("Pname");
    if (name && /^[a-f0-9-]{36}\.pdf$/i.test(name))
      return `https://www.bseindia.com/xml-data/corpfiling/AttachHis/${name}`;
  }
  return url;
}
