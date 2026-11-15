"""Deduplicate collected caches and write a provenance manifest, never invent facts."""
from pathlib import Path
import json, datetime
root=Path(__file__).resolve().parents[1]
p=root/'data/snapshot.json';s=json.loads(p.read_text())
results_path=root/'.source-cache/INFY-FY25-results.json'
if results_path.exists():
 raw=json.loads(results_path.read_text());doc=raw['document'];s['documents'].append(doc)
 facts=json.loads((root/'data/analysis.json').read_text())['results']['evidence']
 s['passages'].extend(facts)
 filing=next(e for e in json.loads((root/'.source-cache/INFY-Apr-2025-filings.json').read_text()) if e['id']=='nse-106204857')
 # The attachment was inspected; its board outcome includes financial results.
 filing.update(category='results',subtype='reported_results',priority='high',reason='The inspected board-outcome attachment includes audited quarterly financial results.',mode='replay',documentId=doc['id'])
 s['events'].append(filing)
s['events']=list({e['id']:e for e in s['events']}.values())
s['documents']=list({d['id']:d for d in s['documents']}.values())
s['passages']=list({(d['documentId'],d['page'],d['text']):d for d in s['passages']}.values())
for f in (root/'.source-cache').glob('*-discovery.json'):
 for candidate in json.loads(f.read_text()).get('documents',[]):
  token=candidate['url'].split('Pname=')[-1].split('/')[-1]
  for d in s['documents']:
   if token in d['url']:d['originalUrl']=candidate['url']
for symbol in sorted(set(d['symbol'] for d in s['documents'])):
 docs=[d for d in s['documents'] if d['symbol']==symbol]
 success=[d for d in docs if d['status']=='extracted']
 s['runs'].append(dict(symbol=symbol,source='documents',status='partial' if any(d['status']=='failed' for d in docs) else 'success',finishedAt=max(d['fetchedAt'] for d in docs),note=f"{len(success)} documents extracted; see the document library for specific coverage gaps."))
s['runs']=list({(r['symbol'],r['source']):r for r in s['runs']}.values())
p.write_text(json.dumps(s,separators=(',',':')))
manifest=dict(createdAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),securityMaster=dict(url='https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv',fetchedAt='2026-11-15T09:10:59.365165+00:00',rows=len(json.loads((root/'data/companies.json').read_text()))),documents=s['documents'],marketSources=[{k:m[k] for k in ['symbol','url','source','fetchedAt','basis']} for m in s['markets']],notes=['Raw PDF files are not bundled. Short source excerpts and numerical facts are retained for this review prototype.','Some annual reports were collected offline with a 40 MB cap. Online jobs use a 12 MB cap and reuse cached documents when available.','Publication time is separate from fetch time. Unknown publication dates are excluded from earlier historical queries.'])
(root/'data/source-manifest.json').write_text(json.dumps(manifest,indent=2))
print(len(s['documents']),'source records;',len(s['passages']),'unique passages;',len(s['events']),'filings')
