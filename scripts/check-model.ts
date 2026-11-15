// Reads the ignored local credential file without printing credentials or raw provider errors.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { generateAnswer, ModelError } from '../lib/model';
import { searchPassages } from '../lib/domain';
const config = parseEnv(readFileSync('.dev.vars', 'utf8'));
const snapshot=JSON.parse(readFileSync('data/snapshot.json','utf8'));
const ids=new Set(snapshot.documents.filter((d:any)=>d.symbol==='INFY').map((d:any)=>d.id));
const evidence=searchPassages('final FY25 revenue growth guidance actual full year',snapshot.passages.filter((p:any)=>ids.has(p.documentId)),'2025-04-23T00:00:00Z');
try {
 const answer = await generateAnswer({ apiKey: config.HYDE_API_KEY ?? '', model: config.HYDE_MODEL,
  company: { symbol: 'INFY', name: 'Infosys Limited', isin: 'INE009A01021' },
  question: 'What was the final FY25 revenue growth guidance and what did Infosys report for the full year? Keep the reporting basis explicit.',
  asOf: '2025-04-23T00:00:00Z', evidence }, async (url,init)=>{
   const response=await fetch(url,init);
   if(response.ok){const raw:any=await response.clone().json();writeFileSync('.source-cache/model-output.json',JSON.stringify({finish:raw.choices?.[0]?.finish_reason,content:raw.choices?.[0]?.message?.content,usage:raw.usage},null,2));}
   return response;
  });
 mkdirSync('.source-cache', { recursive: true });
 writeFileSync('.source-cache/model-check.json', JSON.stringify(answer, null, 2));
 console.log(JSON.stringify({ status: answer.status, model: answer.model, validation: answer.validation, usage: answer.usage, claims: answer.claims.map(c => c.text) }, null, 2));
} catch (error) {
 console.log(JSON.stringify({ status: 'failed', code: error instanceof ModelError ? error.code : 'local_error', message: error instanceof ModelError ? error.message : 'Local model check could not finish.' }));
 process.exitCode = 1;
}
