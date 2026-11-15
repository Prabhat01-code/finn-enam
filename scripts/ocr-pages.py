"""Local recovery path: python scripts/ocr-pages.py input.pdf output.json.

Uses pypdf, pypdfium2 and tesseract. Raw files stay outside the served app.
Only pages lacking usable text are OCR'd; low confidence pages are excluded.
Output is candidate extraction, never a verified financial statement.
"""
import hashlib,json,subprocess,sys,tempfile
from pathlib import Path
from pypdf import PdfReader
import pypdfium2 as pdfium

source,target=map(Path,sys.argv[1:3])
raw=source.read_bytes()
if len(raw)>64*1024*1024:raise SystemExit('Local PDF limit: 64 MB')
reader=PdfReader(source)
if len(reader.pages)>550:raise SystemExit('PDF page limit: 550')
pdf=pdfium.PdfDocument(str(source))
pages=[];receipts=[]
with tempfile.TemporaryDirectory(prefix='finn-ocr-') as tmp:
 for i,page in enumerate(reader.pages):
  text=page.extract_text() or ''
  if len(text.strip())<150:
   image=Path(tmp)/f'{i}.png'
   bitmap=pdf[i].render(scale=3)
   bitmap.to_pil().save(image)
   run=subprocess.run(['tesseract',str(image),'stdout','--psm','3','tsv'],check=True,capture_output=True,text=True,timeout=60)
   import csv,io
   rows=[r for r in csv.DictReader(io.StringIO(run.stdout),delimiter='\t') if r.get('text','').strip() and float(r['conf'])>=0]
   confidence=sum(float(r['conf']) for r in rows)/max(1,len(rows))
   lines={}
   for r in rows:lines.setdefault((r['block_num'],r['par_num'],r['line_num']),[]).append(r['text'])
   text='\n'.join(' '.join(v) for v in lines.values()) if confidence>=80 else ''
   receipts.append({'page':i+1,'method':'tesseract','meanWordConfidence':round(confidence,1),'usable':bool(text),'requiresVisualReview':True})
  pages.append(text)
target.parent.mkdir(parents=True,exist_ok=True)
target.write_text(json.dumps({'hash':hashlib.sha256(raw).hexdigest(),'pages':pages,'ocr':receipts,'reviewStatus':'unreviewed'},ensure_ascii=False))
print(json.dumps({'pages':len(pages),'ocrPages':len(receipts),'excludedPages':sum(not r['usable'] for r in receipts),'output':str(target)}))
