import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateMedium, dailyDate } from '../src/lib/sudoku.js';
const args=process.argv.slice(2);const option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const start=option('--start',dailyDate()),count=Number(option('--count','30'));
if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||Number.isNaN(new Date(`${start}T00:00:00Z`).getTime())||new Date(`${start}T00:00:00Z`).toISOString().slice(0,10)!==start||!Number.isInteger(count)||count<1||count>366)throw Error('Use --start YYYY-MM-DD --count 1..366');
const output=path.resolve(option('--output',path.join(os.homedir(),'Documents/Backups/vodka-puzzle',`daily-sudoku-${start}.sql`)));
if(output.includes(path.resolve('public')+path.sep)||output.includes(path.resolve('dist')+path.sep))throw Error('Answers must not be saved in public or dist');
const puzzles=[],seen=new Set();
for(let i=0;i<count;i++){let p;do{p=generateMedium();}while(seen.has(p.givens));seen.add(p.givens);const date=new Date(`${start}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+i);puzzles.push({...p,date:date.toISOString().slice(0,10)});console.log(`${i+1}/${count} ${puzzles.at(-1).date} medium`);}
const values=puzzles.map(p=>`('${p.date}', '${p.date}T00:00:00+09:00', '${p.givens}', '${p.solution}', '${JSON.stringify(p.techniques)}'::jsonb)`).join(',\n');
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,`BEGIN;\nINSERT INTO private.daily_sudoku (day, opens_at, givens, solution, techniques) VALUES\n${values}\nON CONFLICT (day) DO NOTHING;\nCOMMIT;\n`,{mode:0o600});console.log(`Saved ${output}`);
