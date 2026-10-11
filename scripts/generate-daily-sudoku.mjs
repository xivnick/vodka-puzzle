import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateDaily, grade, dailyDate } from '../src/lib/sudoku.js';
const args=process.argv.slice(2);const option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const start=option('--start',dailyDate()),count=Number(option('--count','30'));
if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||Number.isNaN(new Date(`${start}T00:00:00Z`).getTime())||new Date(`${start}T00:00:00Z`).toISOString().slice(0,10)!==start||!Number.isInteger(count)||count<1||count>366)throw Error('Use --start YYYY-MM-DD --count 1..366');
const output=path.resolve(option('--output',path.join(os.homedir(),'Documents/Backups/vodka-puzzle',`daily-sudoku-${start}.sql`)));
if(output.includes(path.resolve('public')+path.sep)||output.includes(path.resolve('dist')+path.sep))throw Error('Answers must not be saved in public or dist');
const started=performance.now();
const kinds=['pointing','claiming','pair','hiddenPair','triple','hiddenTriple'];
const pool=[],seen=new Set();
const reuse=option('--reuse',null);
if(reuse){
 for(const row of JSON.parse(fs.readFileSync(path.resolve(reuse),'utf8'))){
  const result=grade(row.givens);if(!result.solved)throw Error('Unsupported puzzle in reuse file');
  if(!seen.has(row.givens)){seen.add(row.givens);pool.push({givens:row.givens,...result});}
 }
}
const subsets=p=>p.techniques.pair+p.techniques.hiddenPair+p.techniques.triple+p.techniques.hiddenTriple;
const lighter=p=>subsets(p)===0;
const easyCount=Math.round(count/5),regularCount=count-easyCount;
// A reused batch only needs additional lighter puzzles; keep its existing regular puzzles.
const candidateCount=reuse?Math.max(40,easyCount*20):count*20;
for(let i=0;i<candidateCount;i++){
 const p=generateDaily();if(seen.has(p.givens)){i--;continue;}seen.add(p.givens);
 if(!reuse||lighter(p))pool.push(p);
 if((i+1)%100===0)console.log(`Candidates ${i+1}/${candidateCount}`);
}
const effort=p=>p.techniques.locked+2*p.techniques.pair+3*p.techniques.hiddenPair+5*(p.techniques.triple+p.techniques.hiddenTriple);
const lightPool=pool.filter(lighter).sort((a,b)=>effort(a)-effort(b)||b.givens.replace(/0/g,'').length-a.givens.replace(/0/g,'').length);
const regularPool=pool.filter(p=>!lighter(p));
if(lightPool.length<easyCount||regularPool.length<regularCount)throw Error('Not enough candidates for a mixed batch; generate again or reuse a larger batch');
const light=lightPool.slice(0,easyCount),regular=[],usage=Object.fromEntries(kinds.map(k=>[k,0]));
for(let i=0;i<regularCount;i++){
 const score=p=>kinds.reduce((sum,k)=>sum+(p.techniques[k]?1/(1+usage[k]):0),0);
 let best=0;for(let j=1;j<regularPool.length;j++)if(score(regularPool[j])>score(regularPool[best]))best=j;
 const p=regularPool.splice(best,1)[0];regular.push(p);for(const k of kinds)if(p.techniques[k])usage[k]++;
}
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const schedule=Array(count).fill(null);
// Divide the month into intervals and place one lighter puzzle inside each interval.
for(let i=0;i<easyCount;i++){
 const from=Math.floor(i*count/easyCount),through=Math.floor((i+1)*count/easyCount);
 const center=Math.floor((from+through)/2);
 const slot=Math.max(from,Math.min(through-1,center+Math.floor(Math.random()*3)-1));
 schedule[slot]=light[i];
}
// Spread the most demanding regular puzzles across the entire batch before filling the rest.
const usesTriple=p=>p.techniques.triple+p.techniques.hiddenTriple>0;
regular.sort((a,b)=>Number(usesTriple(b))-Number(usesTriple(a))||effort(b)-effort(a));
const demanding=regular.splice(0,Math.max(Math.ceil(regularCount/4),regular.filter(usesTriple).length));
const free=schedule.map((p,i)=>p?null:i).filter(i=>i!==null);
for(let i=0;i<demanding.length;i++)schedule[free[Math.floor((i+0.5)*free.length/demanding.length)]]=demanding[i];
shuffle(regular);let next=0;
for(let i=0;i<count;i++)if(!schedule[i])schedule[i]=regular[next++];
const puzzles=schedule.map((p,i)=>{
 const date=new Date(`${start}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+i);
 const row={...p,date:date.toISOString().slice(0,10)};
 console.log(`${i+1}/${count} ${row.date} ${lighter(p)?'lighter':'regular'} clues=${p.givens.replace(/0/g,'').length} ${kinds.filter(k=>p.techniques[k]).join(',')||'singles'}`);
 return row;
});
for(const p of light)for(const k of kinds)if(p.techniques[k])usage[k]++;
console.log(`Mix: ${easyCount} lighter, ${regularCount} regular`);
console.log(`Technique coverage: ${JSON.stringify(usage)}`);
console.log(`Generation: ${((performance.now()-started)/1000).toFixed(2)} seconds`);
const values=puzzles.map(p=>`('${p.date}', '${p.date}T00:00:00+09:00', '${p.givens}', '${JSON.stringify(p.techniques)}'::jsonb)`).join(',\n');
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,`BEGIN;\nINSERT INTO private.daily_sudoku (day, opens_at, givens, techniques) VALUES\n${values}\nON CONFLICT (day) DO NOTHING;\nCOMMIT;\n`,{mode:0o600});console.log(`Saved ${output}`);
