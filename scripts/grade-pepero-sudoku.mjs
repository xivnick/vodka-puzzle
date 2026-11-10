// Difficulty review only: no guessing, backtracking, solution counting or answer comparison.
import { givens, sticks, units, stickCombinations } from '../src/lib/pepero-sudoku.js';
const peers = Array.from({length:81}, (_,i) => new Set(units.filter(u => u.includes(i)).flat().filter(j => j !== i)));
const coordinate = i => `r${Math.floor(i/9)+1}c${i%9+1}`;
function review(mode) {
  const values = givens.flat(), stages = [], arithmeticSteps = [];
  while (true) {
    const basic = values.map((n,i) => n ? new Set([n]) : new Set(Array.from({length:9},(_,k)=>k+1).filter(n => ![...peers[i]].some(j=>values[j]===n))));
    const candidates = basic.map(s => new Set(s));
    if (mode !== 'ordinary') for (const cells of sticks) {
      const tuples = stickCombinations(cells.length).filter(t => cells.every((i,k) => candidates[i].has(t[k])));
      if (!tuples.length) throw new Error('The current logical deductions conflict at a stick.');
      cells.forEach((i,k) => {
        const allowed = mode === 'range' ? stickCombinations(cells.length).map(t=>t[k]) : tuples.map(t=>t[k]);
        candidates[i] = new Set([...candidates[i]].filter(n => allowed.includes(n)));
      });
    }
    if (candidates.some(s => !s.size)) throw new Error('The current logical deductions leave an empty candidate set.');
    const next = new Map();
    const assign = (i,n) => {
      if (next.has(i) && next.get(i) !== n) throw new Error('Inconsistent single deductions.');
      next.set(i,n);
    };
    candidates.forEach((s,i) => { if (!values[i] && s.size === 1) assign(i,[...s][0]); });
    for (const unit of units) for (let n=1;n<=9;n++) {
      const positions = unit.filter(i=>candidates[i].has(n));
      if (positions.length===1 && !values[positions[0]]) assign(positions[0],n);
    }
    if (!next.size) break;
    for (const [i,n] of next) {
      if (basic[i].size > 1 && candidates[i].size === 1)
        arithmeticSteps.push({cell:coordinate(i),value:n,before:[...basic[i]]});
      values[i]=n;
    }
    stages.push(next.size);
  }
  return {remaining:values.filter(n=>!n).length,stages,arithmeticSteps};
}
const initial = givens.flat();
const initialCandidates = initial.map((n,i) => n ? [n] : Array.from({length:9},(_,k)=>k+1)
  .filter(n => ![...peers[i]].some(j=>initial[j]===n)));
const openingSticks = sticks.map(cells => {
  const tuples = stickCombinations(cells.length).filter(t => cells.every((i,k) => initialCandidates[i].includes(t[k])));
  return {
    handle:coordinate(cells[0]),
    length:cells.length,
    givenDigits:cells.filter(i=>initial[i]).length,
    possibleCombinations:tuples.length,
    forcedDigits:cells.filter((i,k)=>!initial[i] && new Set(tuples.map(t=>t[k])).size===1).length,
  };
});
console.log(JSON.stringify({openingSticks,givens:givens.flat().filter(Boolean).length,sticks:sticks.length,ordinary:review('ordinary'),rangeOnly:review('range'),pepero:review('pepero')},null,2));
