import { mkdirSync, writeFileSync } from 'node:fs';
import { units, path, candidates, digits, enumerateRoutes, complete, grade, flowMetrics } from './lib/juru-marble-design.mjs';
import { countSolutions } from '../src/lib/sudoku.js';
const out=process.argv[2];if(!out)throw Error('Provide a private output directory; solutions must not be written into public/ or src/.');
if(/(?:^|\/)(?:public|src|dist)(?:\/|$)/.test(out))throw Error('Use a private output directory.');
const initialSeed=Number(process.argv[3]||261101);
let seed=initialSeed, saved=false;
const interleaved=process.argv.includes('--interleaved');
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const routes=enumerateRoutes().filter(r=>!interleaved?r.numbers[0]===3:r.numbers[0]>=3);
function hiddenStart(board,n){if(board[4])return false;const cs=candidates(board);return digits(cs[4]).length>=2&&units[19].filter(i=>!board[i]&&(cs[i]&(1<<n))).length===1;}
for(let attempt=1;attempt<=(interleaved?1500:300);attempt++){
 const route=routes[Math.floor(random()*routes.length)],solution=complete(route,random);if(!solution)continue;
 const startNumber=solution[4];
 const givens=solution.slice();givens[4]=0;
 const choices=shuffle([1,2,3,4,5,6,7,8,9].filter(n=>n!==startNumber));let okay=false;
 for(const n of choices){const next=givens.slice();for(const u of [units[0],units[13],units[19]])for(const i of u)if(next[i]===n)next[i]=0;if(hiddenStart(next,startNumber)){givens.splice(0,81,...next);okay=true;break;}}
 if(!okay)continue;
 for(let pass=0;pass<2;pass++)for(const i of shuffle(Array.from({length:81},(_,i)=>i))){
  if(!givens[i])continue;const old=givens[i];givens[i]=0;
  if(!hiddenStart(givens,startNumber)||!grade(givens,{log:false}).solved)givens[i]=old;
 }
 const result=grade(givens),ordinary=grade(givens,{route:false});
 const routeSteps=result.steps.filter(s=>s.kind==='route-elimination');
 const deep=routeSteps.filter(s=>s.depth>=2);
 const standardBetween=routeSteps.length>=2&&result.steps.slice(result.steps.indexOf(routeSteps[0])+1,result.steps.indexOf(routeSteps.at(-1))).some(s=>['single','hidden-single'].includes(s.kind));
 const clueCount=givens.filter(Boolean).length;
 const flow=flowMetrics(givens,result.steps);
 console.log(JSON.stringify({attempt,clues:clueCount,solved:result.solved,ordinaryRemaining:ordinary.board.filter(n=>!n).length,route:routeSteps.length,deep:deep.length,depths:routeSteps.map(s=>s.depth),standardBetween,flow}));
 if(!result.solved||!deep.length||!standardBetween||ordinary.solved||result.steps[0]?.cell!==4)continue;
 if(interleaved&&(flow.routeCells<3||flow.initialWalks<2||flow.uniqueWalkRemaining>20||flow.routeCompleteRemaining>12||flow.classicStops<1||flow.classicStopsAfterRoute<1||flow.ordinaryGaps.filter(n=>n>=4).length<3||Math.max(...flow.ordinaryGaps)>20))continue;
 // Explicit design requirement: removing the route must leave actual ambiguity.
 const ordinarySolutionCount=countSolutions(givens.join(''),2);if(ordinarySolutionCount<2)continue;
 if(result.board.some((n,i)=>n!==solution[i]))throw Error('Logical trace disagrees with construction.');
 mkdirSync(out,{recursive:true});
 const artifact={seed:initialSeed,finalSeed:seed,attempt,givens,solution,route,clueCount,flow,ordinarySolutionCountAtLeast:ordinarySolutionCount,ordinaryRemaining:ordinary.board.filter(n=>!n).length,steps:result.steps};
 writeFileSync(`${out}/design.json`,JSON.stringify(artifact,null,2)+'\n');
 console.log('SAVED',out,'givens',givens.join(''));
 saved=true;
 break;
}

if(!saved)throw Error('No candidate met all design requirements.');
