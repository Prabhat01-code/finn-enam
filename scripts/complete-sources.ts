import {readFile,writeFile} from 'node:fs/promises';
import {getDocumentProxy} from 'unpdf';
import {fetchFilings,fetchSource,discover,parseDocument} from '../lib/collectors';
import companies from '../data/companies.json';
const s=JSON.parse(await readFile('data/snapshot.json','utf8'));
// Offline seed generation can use a larger bound than the 12 MB online worker.
for(const symbol of ['HCLTECH','POLYCAB','TCS','ASIANPAINT']){
 const company=companies.find(c=>c.symbol===symbol)!;
 try{const found=await discover(company);console.log(symbol,'identity and links verified',found.companyHost);
  for(const input of found.documents){
   if(s.documents.some((d:any)=>d.url===input.url&&d.status==='extracted'))continue;
   try{const parsed=await parseDocument(company,input,found.companyHost,40*1024*1024);s.documents=s.documents.filter((d:any)=>d.url!==input.url);s.documents.push(parsed.document);s.passages.push(...parsed.passages.map(p=>({...p,availableAt:parsed.document.fetchedAt})));console.log(symbol,input.type,parsed.document.pages,'pages',parsed.passages.length,'passages');}
   catch(e:any){console.log(symbol,input.type,'FAILED',e.message);}
   await writeFile('data/snapshot.json',JSON.stringify(s));
  }
 }catch(e:any){console.log(symbol,'FAILED',e.message);}
}
const filings=await fetchFilings('INFY',new Date('2025-04-15'),new Date('2025-04-22'));
await writeFile('.source-cache/INFY-Apr-2025-filings.json',JSON.stringify(filings,null,2));
for(const filing of filings.filter(f=>f.subtype==='reported_results').slice(0,1)){
 const company=companies.find(c=>c.symbol==='INFY')!;
 const input={url:filing.url,title:'Infosys consolidated quarterly results · March 2025',type:'results',period:'Q4 FY25',publishedAt:filing.publishedAt};
 try{const parsed=await parseDocument(company,input,'infosys.com',40*1024*1024);s.documents.push(parsed.document);s.passages.push(...parsed.passages);s.events.push({...filing,mode:'replay'});const fetched=await fetchSource(filing.url,'infosys.com',40*1024*1024);const pdf=await getDocumentProxy(fetched.bytes,{isEvalSupported:false});const pages=[];for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p);const t=await page.getTextContent();pages.push(t.items.map((i:any)=>i.str??'').join(' '));}await pdf.destroy();await writeFile('.source-cache/INFY-FY25-results.json',JSON.stringify({document:parsed.document,pages},null,2));console.log('INFY FY25 results',parsed.document.pages,'pages');}
 catch(e:any){console.log('INFY FY25 results FAILED',e.message);}
}
await writeFile('data/snapshot.json',JSON.stringify(s));
