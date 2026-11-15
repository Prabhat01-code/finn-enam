"""Read-only source access probes. Raw downloads stay in ignored .source-cache."""
import urllib.request, concurrent.futures, pathlib, json, datetime
ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / '.source-cache'
CACHE.mkdir(exist_ok=True)
URLS = {
 'yahoo': 'https://query1.finance.yahoo.com/v8/finance/chart/INFY.NS?range=3mo&interval=1d',
 'screener': 'https://www.screener.in/company/INFY/consolidated/',
 'nse_symbols': 'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv',
 'nse_filings': 'https://www.nseindia.com/api/corporate-announcements?index=equities&symbol=INFY&from_date=01-10-2026&to_date=15-11-2026',
 'infosys': 'https://www.infosys.com/investors/reports-filings/annual-report.html'
}
def get(item):
 key, url = item
 try:
  r = urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent': 'Mozilla/5.0'}),timeout=25)
  content=r.read()
  result = dict(key=key, url=r.url, status=r.status, bytes=len(content), type=r.headers.get('Content-Type'), fetched_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
  if r.status == 200: (CACHE/key).write_bytes(content)
 except Exception as e: result = dict(key=key, url=url, error=str(e)[:240])
 print(json.dumps(result), flush=True)
 return result
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 results=list(pool.map(get, URLS.items()))
(CACHE/'spike.json').write_text(json.dumps(results, indent=2))
