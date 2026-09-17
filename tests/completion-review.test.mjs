import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('review accepts a rule-compliant daily board and rejects conflicts, changed givens and malformed snapshots',()=>{
 const values=Array.from({length:81},(_,i)=>(Math.floor(i/9)*3+Math.floor(Math.floor(i/9)/3)+i%9)%9+1);
 const row={nickname:'solver',puzzle_id:'daily-sudoku:2026-09-17',state_version:1,state:{values},givens:'0'.repeat(81)};
 const cases=[row,{...row,state:{values:[...values.slice(0,80),values[79]]}},{...row,givens:'9'+'0'.repeat(80)},{...row,state:null},{...row,state_version:2},{...row,puzzle_id:'260917_01',state:{values:'1'.repeat(81)}},{...row,puzzle_id:'260916_01',state:{version:1,rects:[{r0:0,c0:0,r1:8,c1:8}]}},{...row,puzzle_id:'unknown'}];
 const result=spawnSync(process.execPath,['scripts/check-completion-states.mjs'],{input:JSON.stringify(cases),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(result.stdout.trim().split('\n').map(line=>JSON.parse(line).result),['valid','invalid','invalid','state_missing','unsupported_version','invalid','invalid','unsupported_puzzle']);
});
