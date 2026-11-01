// Refine clue placement while keeping a fixed construction board private.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {grade,flowMetrics,candidates,digits,units} from './lib/juru-marble-design.mjs';
import {countSolutions} from '../src/lib/sudoku.js';
export function refineDesign(source, {seed:initialSeed=261104,maxIterations=50000,onProgress=()=>{}}={}) {
const solution=source.solution;
let seed=Number(initialSeed);
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
const pick=xs=>xs[Math.floor(random()*xs.length)];
const options={directOnly:true,allowPairs:false,maxLookahead:1};
function hiddenStart(b){if(b[4])return false;const cs=candidates(b);return digits(cs[4]).length>1&&units[19].filter(i=>!b[i]&&(cs[i]&(1<<solution[4]))).length===1;}
function evaluate(givens){
 if(!hiddenStart(givens))return null;
 const result=grade(givens,options);if(!result.solved)return null;
 const f=flowMetrics(givens,result.steps);if(!f.routeCells)return null;
 const goodGaps=f.ordinaryGaps.filter(n=>n>=4).length;
 const score=7*Math.min(f.openingWalks,8)+6*Math.min(f.openingPrefixes3,6)
  +2*Math.max(0,50-f.uniqueWalkRemaining)+1.5*Math.max(0,25-f.routeCompleteRemaining)
  +6*Math.min(f.routeCells,4)+(f.classicStopsAfterRoute?15:0)+12*Math.min(goodGaps,3)
  -Math.max(0,Math.max(...f.ordinaryGaps)-24);
 return {givens,steps:result.steps,flow:f,score};
}
function accepted(f){return f.openingWalks>=6&&f.openingPrefixes3>=4&&f.firstRouteRemaining>=28
 &&f.routeCells>=2&&f.uniqueWalkRemaining<=24&&f.routeCompleteRemaining<=15
 &&f.classicStopsAfterRoute>=1&&f.ordinaryGaps.filter(n=>n>=4).length>=2&&Math.max(...f.ordinaryGaps)<=24;}
let current=evaluate(source.givens),best=current;
if(!current)throw Error('Seed must solve with direct route rules and basic Sudoku only.');
for(let iteration=0;iteration<maxIterations;iteration++){
 const b=(random()<.08?best:current).givens.slice();
 const add=Math.floor(random()*3),remove=Math.floor(random()*4);
 if(!add&&!remove)continue;
 for(let k=0;k<add;k++){const places=b.flatMap((n,i)=>!n&&i!==4?[i]:[]);if(places.length){const i=pick(places);b[i]=solution[i];}}
 for(let k=0;k<remove;k++){const places=b.flatMap((n,i)=>n?[i]:[]);if(places.length)b[pick(places)]=0;}
 const clues=b.filter(Boolean).length;if(clues<18||clues>34)continue;
 const next=evaluate(b);if(!next)continue;
 const temperature=3+5*(1-(iteration%1000)/1000);
 if(next.score>current.score||random()<Math.exp((next.score-current.score)/temperature))current=next;
 if(next.score>best.score){best=next;onProgress({iteration,clues,score:best.score,flow:best.flow});}
 if(!accepted(next.flow)||countSolutions(b.join(''),2)<2)continue;
 return {...source,givens:b,mode:'direct-basic',clueCount:clues,steps:next.steps,flow:next.flow,
  ordinaryRemaining:grade(b,{route:false,allowPairs:false}).board.filter(n=>!n).length,
  ordinarySolutionCountAtLeast:2,refinementSeed:Number(initialSeed),refinementIteration:iteration};
}
return null;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [input,output,seedText='261104']=process.argv.slice(2);
 if(!input||!output)throw Error('Provide a private design.json and private output directory.');
 if(/(?:^|\/)(?:src|dist|public)(?:\/|$)/.test(output))throw Error('Answers must remain private.');
 const source=JSON.parse(readFileSync(input,'utf8'));
 const result=refineDesign(source,{seed:Number(seedText),onProgress:p=>console.log(JSON.stringify(p))});
 if(!result)throw Error('No refined candidate met the direct/basic design requirements.');
 mkdirSync(output,{recursive:true});
 writeFileSync(`${output}/design.json`,JSON.stringify({...result,source:input},null,2)+'\n');
 console.log('SAVED',output);
}
