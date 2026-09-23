import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { balanceLoopPuzzles, edgeKey, validateBalanceLoop } from '../src/lib/balance-loop.js';
// Artificial small loops exercise rule checking; these are not puzzle solutions.
const grid=()=>Array.from({length:5},()=>Array(5).fill(''));
const loop=points=>new Set(points.map((p,i)=>edgeKey(p,points[(i+1)%points.length])));
const rectangle=()=>loop([0,1,2,7,12,11,10,5]);
test('photo dimensions and clue counts',()=>{
  assert.deepEqual(balanceLoopPuzzles.map(p=>[p.clues.length,p.clues[0].length,p.clues.flat().filter(Boolean).length]),[[10,10,20],[13,13,30]]);
  balanceLoopPuzzles.forEach(p=>assert.ok(p.clues.every(row=>row.length===p.clues.length)));
});
test('equal arms at corners are positive and count up to the next turn',()=>{
  const clues=grid(); clues[0][0]='w4'; clues[0][1]='w2';
  const result=validateBalanceLoop(clues,rectangle());
  assert.equal(result.complete,true); assert.deepEqual(result.arms[0],[2,2]); assert.deepEqual(result.arms[1],[1,1]);
});
test('black shape and number are separate simultaneous constraints',()=>{
  const clues=grid();clues[0][0]='b4';
  assert.deepEqual(validateBalanceLoop(clues,rectangle()).errors,[0]);
  const unequal=loop([0,1,2,3,8,13,12,11,10,5]);clues[0][0]='b5';
  assert.equal(validateBalanceLoop(clues,unequal).complete,true);
  clues[0][0]='b6';assert.equal(validateBalanceLoop(clues,unequal).complete,false);
});
test('incomplete arms wait; open paths cannot complete',()=>{
  const clues=grid();clues[0][0]='w4';
  const result=validateBalanceLoop(clues,new Set(['0:1','0:5']));
  assert.equal(result.complete,false);assert.deepEqual(result.errors,[]);assert.deepEqual(result.arms[0],[null,null]);
});
test('missing clue, separate loops, branches and nonadjacent edges fail',()=>{
  const clues=grid();clues[4][4]='w';assert.equal(validateBalanceLoop(clues,rectangle()).complete,false);
  const separate=new Set([...loop([0,1,6,5]),...loop([18,19,24,23])]);
  assert.equal(validateBalanceLoop(grid(),separate).complete,false);
  const branch=rectangle();branch.add('2:3');assert.ok(validateBalanceLoop(grid(),branch).errors.includes(2));
  for(const edge of ['4:5','0:24','-1:0','0:25','0:0','1:0']) assert.equal(validateBalanceLoop(grid(),new Set([edge])).malformed,true);
  assert.equal(validateBalanceLoop(grid(),new Set()).complete,false);
});
test('previews have no catalog entries, persistence or completion submission',()=>{
  const catalog=readFileSync(new URL('../src/data/puzzles.json',import.meta.url),'utf8');
  assert.ok(!catalog.includes('balance-loop'));
  const script=readFileSync(new URL('../src/scripts/balance-loop.js',import.meta.url),'utf8');
  assert.doesNotMatch(script,/recordCompletion|localStorage|handleCloud|saveLocalState/);
  for(const n of [1,2]) {
    const html=readFileSync(new URL(`../dist/test/balance-loop/260923-${n}/index.html`,import.meta.url),'utf8');
    assert.ok(html.includes(`260923 밸런스 루프 ${n}`));assert.ok(!html.includes('id="cloudBtns"'));assert.ok(!html.includes('id="leaderboard"'));
  }
});
