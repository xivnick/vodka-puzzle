import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {puzzles,previewPuzzles,parseState,conflicts,solved} from '../src/lib/thermo-sudoku.js';
test('published thermo pages have separate IDs, rankings and cloud controls; previews remain isolated',()=>{
 const home=fs.readFileSync('dist/index.html','utf8');
 for(const [i,slug] of ['easy','medium','hard'].entries()){
  const id=`260917_0${i+1}`;
  const html=fs.readFileSync(`dist/${id}/index.html`,'utf8');
  assert(home.includes(`data-puzzle-id="${id}"`));
  assert(html.includes(`data-puzzle-id="${id}"`));
  assert(html.includes('data-preview="false"'));
  assert(html.includes('id="cloudBtns"')&&html.includes('id="leaderboard"'));
  const preview=fs.readFileSync(`dist/test/thermo-sudoku/${slug}/index.html`,'utf8');
  assert(preview.includes('data-preview="true"'));
  assert(!preview.includes('id="cloudBtns"')&&!preview.includes('id="leaderboard"'));
 }
});
test('progress accepts only matching puzzle state and restores givens',()=>{
 const p=puzzles[0],id='260917_01';
 const saved={version:1,puzzleId:id,values:Array(81).fill(0),notes:Array.from({length:81},()=>[])};
 saved.values[2]=4;saved.notes[3]=[2,2,8];saved.notes[0]=[1];
 const parsed=parseState(p,saved,id);
 assert.equal(parsed.values[0],5);assert.equal(parsed.values[2],4);
 assert.deepEqual(parsed.notes[0],[]);assert.deepEqual(parsed.notes[3],[2,8]);
 assert.equal(parseState(p,saved,'260917_02'),null);
 assert.equal(parseState(p,{...saved,values:[10]},id),null);
 assert.equal(parseState(p,{...saved,notes:null},id),null);
 assert.equal(parseState(p,null,id),null);
});
test('thermometer errors compare entered order without predicting empty cells',()=>{
 const p={thermometers:[[[1,1],[2,4],[3,7],[4,2]]]},v=Array(81).fill(0);
 v[28]=1;assert.equal(conflicts(p,v).size,0);
 v[0]=9;v[28]=0;assert.equal(conflicts(p,v).size,0);
 v[0]=3;v[28]=4;assert.equal(conflicts(p,v).size,0);
 v[28]=2;assert.deepEqual([...conflicts(p,v)].sort((a,b)=>a-b),[0,28]);
});

test('photo previews render matching sizes and stay outside catalog and saving',()=>{
 const catalog=fs.readFileSync('src/data/puzzles.json','utf8');
 for(const p of previewPuzzles){
  const html=fs.readFileSync(`dist/test/thermo-sudoku/${p.id}/index.html`,'utf8');
  assert.equal((html.match(/data-cell=/g)||[]).length,p.givens.length**2);
  assert.equal((html.match(/data-number=/g)||[]).length,p.givens.length);
  assert(html.includes('data-preview="true"'));
  assert(!html.includes('id="cloudBtns"')&&!html.includes('id="leaderboard"'));
  assert(!catalog.includes(p.id));
 }
});
test('six by six checks 2 by 3 regions, diagonal thermometers and valid completion',()=>{
 const p=previewPuzzles[1],v=Array(36).fill(0);
 v[0]=2;v[8]=2;assert.deepEqual([...conflicts(p,v)].sort((a,b)=>a-b),[0,8]);
 v.fill(0);v[7]=3;v[0]=2;assert.deepEqual([...conflicts(p,v)].sort((a,b)=>a-b),[0,7]);
 v[0]=4;assert.equal(conflicts(p,v).size,0);
 const board=[1,2,3,4,5,6,4,5,6,1,2,3,2,3,4,5,6,1,5,6,1,2,3,4,3,4,5,6,1,2,6,1,2,3,4,5];
 const fixture={givens:Array.from({length:6},()=>Array(6).fill(0)),boxRows:2,boxCols:3,thermometers:[[[1,1],[2,2]]]};
 assert(solved(fixture,board));
 assert(!solved(fixture,board.map((n,i)=>i===0?7:n)));
 assert(!solved(fixture,board.slice(0,35)));
 const state={version:1,puzzleId:p.id,values:Array(36).fill(0),notes:Array.from({length:36},()=>[])};
 assert.equal(parseState(p,state,p.id).values[3],1);
 state.notes[0]=[7];assert.equal(parseState(p,state,p.id),null);
});
