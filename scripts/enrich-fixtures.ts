import { readFile,writeFile } from 'node:fs/promises';
import { load } from 'cheerio';
import { getDocumentProxy } from 'unpdf';
import { fetchSource,parseDocument,discover } from '../lib/collectors';
import companies from '../data/companies.json';
const snapshot=JSON.parse(await readFile('data/snapshot.json','utf8'));
const infy=companies.find(c=>c.symbol==='INFY')!;
const $=load(await readFile('.source-cache/screener','utf8'));
const target=['Apr 2024','Jul 2024','Oct 2024','Jan 2025','Apr 2025'];
for(const period of target){
 const li=$('.concalls li').filter((_,el)=>$(el).find('div').first().text().trim()===period).first();
 const url=li.find('a').filter((_,a)=>$(a).text().trim()==='Transcript').attr('href');if(!url)continue;
 try{
  const input={url,title:`Infosys earnings call · ${period}`,type:'transcript',period,publishedAt:null};
  const parsed=await parseDocument(infy,input,'infosys.com');
  snapshot.documents=snapshot.documents.filter((d:any)=>d.url!==url);snapshot.documents.push(parsed.document);
  snapshot.passages=snapshot.passages.filter((p:any)=>p.documentId!==parsed.document.id);snapshot.passages.push(...parsed.passages.map(p=>({...p,availableAt:parsed.document.fetchedAt})));
  const fetched=await fetchSource(url,'infosys.com');const pdf=await getDocumentProxy(fetched.bytes,{isEvalSupported:false});const pages=[];for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p);const t=await page.getTextContent();pages.push(t.items.map((i:any)=>i.str??'').join(' '));}await pdf.destroy();
  await writeFile(`.source-cache/INFY-${period.replace(' ','-')}.json`,JSON.stringify({document:parsed.document,pages},null,2));
  console.log(period,parsed.document.id,parsed.document.pages);
 }catch(e:any){console.log(period,'FAILED',e.message);}
}
await writeFile('data/snapshot.json',JSON.stringify(snapshot));
