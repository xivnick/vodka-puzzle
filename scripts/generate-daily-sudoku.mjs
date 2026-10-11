import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateDaily, dailyDate } from '../src/lib/sudoku.js';
const args=process.argv.slice(2);const option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const start=option('--start',dailyDate()),count=Number(option('--count','30'));
if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||Number.isNaN(new Date(`${start}T00:00:00Z`).getTime())||new Date(`${start}T00:00:00Z`).toISOString().slice(0,10)!==start||!Number.isInteger(count)||count<1||count>366)throw Error('Use --start YYYY-MM-DD --count 1..366');
const output=path.resolve(option('--output',path.join(os.homedir(),'Documents/Backups/vodka-puzzle',`daily-sudoku-${start}.sql`)));
if(output.includes(path.resolve('public')+path.sep)||output.includes(path.resolve('dist')+path.sep))throw Error('Answers must not be saved in public or dist');
const started=performance.now();
const kinds=['pointing','claiming','pair','hiddenPair','triple','hiddenTriple'];
const pool=[],seen=new Set();
for(let i=0;i<count*20;i++){
 const p=generateDaily();if(seen.has(p.givens)){i--;continue;}seen.add(p.givens);pool.push(p);
 if((i+1)%100===0)console.log(`Candidates ${i+1}/${count*20}`);
}
const puzzles=[],usage=Object.fromEntries(kinds.map(k=>[k,0]));
for(let i=0;i<count;i++){
 const previous=puzzles.at(-1);
 // Prefer less represented techniques and different adjacent profiles, without quotas.
 const score=p=>kinds.reduce((sum,k)=>sum+(p.techniques[k]?1/(1+usage[k]):0)+(previous&&Boolean(p.techniques[k])!==Boolean(previous.techniques[k])?0.15:0),0);
 let best=0;for(let j=1;j<pool.length;j++)if(score(pool[j])>score(pool[best]))best=j;
 const p=pool.splice(best,1)[0];for(const k of kinds)if(p.techniques[k])usage[k]++;
 const date=new Date(`${start}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+i);
 puzzles.push({...p,date:date.toISOString().slice(0,10)});
 console.log(`${i+1}/${count} ${puzzles.at(-1).date} clues=${[...p.givens].filter(n=>n!=='0').length} ${kinds.filter(k=>p.techniques[k]).join(',')||'singles'}`);
}
console.log(`Technique coverage: ${JSON.stringify(usage)}`);
console.log(`Generation: ${((performance.now()-started)/1000).toFixed(2)} seconds`);
const values=puzzles.map(p=>`('${p.date}', '${p.date}T00:00:00+09:00', '${p.givens}', '${JSON.stringify(p.techniques)}'::jsonb)`).join(',\n');
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,`BEGIN;\nINSERT INTO private.daily_sudoku (day, opens_at, givens, techniques) VALUES\n${values}\nON CONFLICT (day) DO NOTHING;\nCOMMIT;\n`,{mode:0o600});console.log(`Saved ${output}`);
