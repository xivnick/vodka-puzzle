import {balanceLoopPuzzles,parseBalanceLoopState,validateBalanceLoop} from '../src/lib/balance-loop.js';
// Read JSON from the admin review script; evaluate each puzzle's existing rules.
import {puzzles,photoPuzzles,solved} from '../src/lib/thermo-sudoku.js';
import {parseState,analyze} from '../src/lib/mini-rectangles.js';
import {units} from '../src/lib/sudoku.js';
import {equalSumSudoku260921,solvedEqualSumSudoku} from '../src/lib/equal-sum-sudoku.js';
import {formulaCompletion260922_01,formulaCompletion260922_02,formulaCompletion260922_03,isSolvedFormula} from '../src/lib/formula-completion.js';
let input='';for await(const chunk of process.stdin)input+=chunk;
const difficulties={'260917_01':'easy','260917_02':'medium','260917_03':'hard','260918_01':'photo-20260918-1','260918_02':'photo-20260918-2'};
export function review(row){
 if(!row.state)return 'state_missing';
 if(row.state_version!==1)return 'unsupported_version';
 if(row.puzzle_id==='260916_01'){const rects=parseState(row.state);return rects&&analyze(rects).complete?'valid':'invalid';}
 if(difficulties[row.puzzle_id])return Array.isArray(row.state.values)&&solved([...puzzles,...photoPuzzles].find(p=>p.id===difficulties[row.puzzle_id]),row.state.values||[])?'valid':'invalid';
 if(row.puzzle_id==='260921_01')return Array.isArray(row.state.values)&&solvedEqualSumSudoku(equalSumSudoku260921,row.state.values)?'valid':'invalid';
 const formulaPuzzles={'260922_01':formulaCompletion260922_01,'260922_02':formulaCompletion260922_02,'260922_03':formulaCompletion260922_03};
 if(formulaPuzzles[row.puzzle_id])return Array.isArray(row.state.tokens)&&isSolvedFormula(formulaPuzzles[row.puzzle_id],row.state.tokens)?'valid':'invalid';
 if(['260923_01','260923_02'].includes(row.puzzle_id)){
  const clues=balanceLoopPuzzles[Number(row.puzzle_id.slice(-1))-1].clues;
  const edges=parseBalanceLoopState(clues,row.state,row.puzzle_id);
  return edges && validateBalanceLoop(clues,edges).complete?'valid':'invalid';
 }
 if(row.puzzle_id.startsWith('daily-sudoku:')){
  const v=row.state.values,g=row.givens;
  if(!g)return 'puzzle_missing';
  return Array.isArray(v)&&v.length===81&&v.every(n=>Number.isInteger(n)&&n>=1&&n<=9)&&g.split('').every((n,i)=>n==='0'||Number(n)===v[i])&&units.every(u=>new Set(u.map(i=>v[i])).size===9)?'valid':'invalid';
 }
 return 'unsupported_puzzle';
}
if(input)for(const row of JSON.parse(input))console.log(JSON.stringify({nickname:row.nickname,puzzle_id:row.puzzle_id,submitted_at:row.submitted_at,result:review(row)}));
