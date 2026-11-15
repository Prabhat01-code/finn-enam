import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { discover,fetchFilings,fetchMarket,parseDocument } from '../lib/collectors';
import { PORTFOLIO,type Company } from '../lib/domain';
import companies from '../data/companies.json';
const output='data/snapshot.json';
await mkdir('.source-cache',{recursive:true});
let snapshot:any={asOf:new Date().toISOString(),companies:[],markets:[],events:[],documents:[],passages:[],runs:[]};
try{snapshot=JSON.parse(await readFile(output,'utf8'));}catch{}
const save=()=>writeFile(output,JSON.stringify(snapshot));
const only=process.argv.slice(2);
const symbols=only.length?only:Object.keys(PORTFOLIO);
for(const symbol of symbols){
 const company=companies.find(c=>c.symbol===symbol) as Company|undefined;if(!company)throw new Error('Unknown ticker '+symbol);
 company.sector=PORTFOLIO[symbol]??'Other';
 if(!snapshot.companies.some((c:any)=>c.symbol===symbol))snapshot.companies.push(company);
 for(const source of ['prices','filings']) {
  try {
   if(source==='prices'){const market=await fetchMarket(symbol);snapshot.markets=snapshot.markets.filter((m:any)=>m.symbol!==symbol);snapshot.markets.push(market);console.log(symbol,'prices',market.bars.length,market.latest?.date);}
   else {const to=new Date(),from=new Date(to.getTime()-45*86400000);const events=await fetchFilings(symbol,from,to);snapshot.events=snapshot.events.filter((e:any)=>e.symbol!==symbol);snapshot.events.push(...events);console.log(symbol,'filings',events.length);}
   snapshot.runs.push({symbol,source,status:'success',finishedAt:new Date().toISOString(),note:source==='filings'?'NSE returned a dated symbol response. Independent pagination completeness is not guaranteed.':'Completed sessions only.'});
  }catch(e:any){console.log(symbol,source,e.message);snapshot.runs.push({symbol,source,status:'failed',finishedAt:new Date().toISOString(),error:e.message});}
  snapshot.asOf=new Date().toISOString();await save();
 }
 if(!['INFY','HCLTECH','POLYCAB','TCS'].includes(symbol)&&!only.length)continue;
 try {
  const discovery=await discover(company);await writeFile(`.source-cache/${symbol}-discovery.json`,JSON.stringify(discovery,null,2));
  console.log(symbol,'discovered',discovery.documents.length,'documents',discovery.companyHost);
  const docs=discovery.documents;
  // A real results filing and the transcript use the exact same extraction path.
  const result=snapshot.events.find((e:any)=>e.symbol===symbol&&e.subtype==='reported_results');
  if(result)docs.push({url:result.url,title:result.description,type:'results',period:result.publishedAt.slice(0,10),publishedAt:result.publishedAt});
  for(const input of docs){
   if(snapshot.documents.some((d:any)=>d.url===input.url&&d.status==='extracted'))continue;
   try {
    const parsed=await parseDocument(company,input,discovery.companyHost);
    // No date is invented: unknown publication dates use retrieval time for current-only search.
    parsed.passages=parsed.passages.map(p=>({...p,availableAt:parsed.document.fetchedAt}));
    snapshot.documents.push(parsed.document);snapshot.passages.push(...parsed.passages);
    console.log(symbol,input.type,'parsed',parsed.document.pages,'pages',parsed.passages.length,'passages');
   }catch(e:any){snapshot.documents.push({id:'failed-'+symbol+'-'+input.type+'-'+input.period,symbol,...input,status:'failed',error:e.message,fetchedAt:new Date().toISOString(),pages:0});console.log(symbol,input.type,'FAILED',e.message);}
   await save();
  }
 }catch(e:any){console.log(symbol,'discovery FAILED',e.message);snapshot.runs.push({symbol,source:'documents',status:'failed',error:e.message,finishedAt:new Date().toISOString()});await save();}
}
console.log('Snapshot saved:',snapshot.companies.length,'companies',snapshot.events.length,'events',snapshot.documents.length,'documents');
