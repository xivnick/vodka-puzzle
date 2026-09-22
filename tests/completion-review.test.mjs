import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('review accepts a rule-compliant daily board and rejects conflicts, changed givens and malformed snapshots',()=>{
 const values=Array.from({length:81},(_,i)=>(Math.floor(i/9)*3+Math.floor(Math.floor(i/9)/3)+i%9)%9+1);
 const equalSumValues=[2,5,8,1,9,7,3,4,6,1,4,6,5,8,3,9,2,7,7,9,3,4,6,2,8,5,1,5,3,2,7,1,6,4,9,8,4,6,9,8,3,5,1,7,2,8,7,1,2,4,9,5,6,3,9,1,4,6,2,8,7,3,5,6,8,7,3,5,4,2,1,9,3,2,5,9,7,1,6,8,4];
 const row={nickname:'solver',puzzle_id:'daily-sudoku:2026-09-17',state_version:1,state:{values},givens:'0'.repeat(81)};
 const cases=[row,{...row,state:{values:[...values.slice(0,80),values[79]]}},{...row,givens:'9'+'0'.repeat(80)},{...row,state:null},{...row,state_version:2},{...row,puzzle_id:'260917_01',state:{values:'1'.repeat(81)}},{...row,puzzle_id:'260916_01',state:{version:1,rects:[{r0:0,c0:0,r1:8,c1:8}]}},{...row,puzzle_id:'260921_01',state:{values:equalSumValues}},{...row,puzzle_id:'260922_01',state:{tokens:['8','/','(','3','-','8','/','3',')']}},{...row,puzzle_id:'260922_02',state:{tokens:['5','*','13','-','(','6','+','25',')']}},{...row,puzzle_id:'260922_02',state:{tokens:['5','+','6','+','13','+','25']}},{...row,puzzle_id:'unknown'}];
 const result=spawnSync(process.execPath,['scripts/check-completion-states.mjs'],{input:JSON.stringify(cases),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(result.stdout.trim().split('\n').map(line=>JSON.parse(line).result),['valid','invalid','invalid','state_missing','unsupported_version','invalid','invalid','valid','valid','valid','invalid','unsupported_puzzle']);
});
