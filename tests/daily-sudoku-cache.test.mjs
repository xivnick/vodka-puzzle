import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readPuzzleCache,writePuzzleCache} from '../src/lib/daily-sudoku-cache.js';
function storage(){const entries=new Map();return {entries,getItem:k=>entries.get(k)||null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};}
const puzzle={day:'2026-09-17',current_day:'2026-09-17',available:true,givens:'0'.repeat(81),solution:'1'.repeat(81),rankings:[{nickname:'private'}]};
test('same-day cache restores givens without storing answers or account rankings',()=>{
 const s=storage();writePuzzleCache(s,puzzle);
 assert.equal(readPuzzleCache(s,'2026-09-17').givens,puzzle.givens);
 const saved=JSON.parse([...s.entries.values()][0]);assert.deepEqual(Object.keys(saved).sort(),['day','givens','version']);
 assert.equal(readPuzzleCache(s,'2026-09-17','2026-09-16'),null);
});
test('date rollover evicts old puzzle; malformed or unavailable puzzles are not restored',()=>{
 const s=storage();writePuzzleCache(s,puzzle);assert.equal(readPuzzleCache(s,'2026-09-18'),null);assert.equal(s.entries.size,0);
 s.setItem('daily-sudoku:puzzle-cache',JSON.stringify({version:1,day:'2026-09-17',givens:'invalid'}));assert.equal(readPuzzleCache(s,'2026-09-17'),null);
 writePuzzleCache(s,{...puzzle,available:false});assert.equal(s.entries.size,0);
 s.setItem('daily-sudoku:puzzle-cache','{');assert.equal(readPuzzleCache(s,'2026-09-17'),null);
});
test('storage denial does not prevent fetching and playing a puzzle',()=>{
 const denied={getItem(){throw Error('disabled');},setItem(){throw Error('full');}};
 assert.equal(readPuzzleCache(denied,'2026-09-17'),null);assert.doesNotThrow(()=>writePuzzleCache(denied,puzzle));
});
