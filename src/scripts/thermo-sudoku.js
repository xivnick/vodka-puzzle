import {puzzles,previewPuzzles,conflicts,solved,parseState} from '../lib/thermo-sudoku.js';
const $=id=>document.getElementById(id);
const puzzle=[...puzzles,...previewPuzzles].find(p=>p.id===$('thermoGame').dataset.difficulty);
const givens=puzzle.givens.flat(),size=puzzle.givens.length;
const ID=$('thermoGame').dataset.puzzleId,preview=$('thermoGame').dataset.preview==='true';
let ready=preview,completed=false;
function state(){return {version:1,puzzleId:ID,values:values.slice(),notes:notes.map(a=>a.slice())};}
function persist(){if(preview||!ready)return;try{window.saveLocalState(ID,state());}catch{window.showToast('브라우저에 저장하지 못했습니다.');}}
function checkComplete(){if(!preview&&ready&&!completed&&solved(puzzle,values)){completed=true;window.recordCompletion(ID,state());}}
function update(){persist();render();checkComplete();}
let values=givens.slice(),notes=Array.from({length:size*size},()=>[]),selected=0,notesMode=false;
function render(){
 const bad=conflicts(puzzle,values);
 for(const cell of $('thermoCells').children){const i=Number(cell.dataset.cell);cell.classList.toggle('selected',i===selected);cell.classList.toggle('conflict',bad.has(i));cell.tabIndex=i===selected?0:-1;cell.setAttribute('aria-label',`${Math.floor(i/size)+1}행 ${i%size+1}열, ${values[i]||'빈칸'}${givens[i]?', 고정 숫자':''}${bad.has(i)?', 규칙 위반':''}${!values[i]&&notes[i].length?`, 메모 ${notes[i].join(', ')}`:''}`);cell.replaceChildren();if(values[i])cell.textContent=values[i];else{const box=document.createElement('span');box.className='notes';box.setAttribute('aria-hidden','true');for(let n=1;n<=size;n++){const span=document.createElement('span');span.textContent=notes[i].includes(n)?n:'';box.append(span);}cell.append(box);}}
 $('thermoComplete').hidden=!solved(puzzle,values);
}
function focus(){document.querySelector(`[data-cell="${selected}"]`).focus();}
function change(n){if(!ready||givens[selected])return;if(notesMode&&n){if(values[selected])return;notes[selected]=notes[selected].includes(n)?notes[selected].filter(v=>v!==n):[...notes[selected],n];}else{values[selected]=n;notes[selected]=[];}update();}
function toggleNotes(){notesMode=!notesMode;$('thermoNotes').setAttribute('aria-pressed',String(notesMode));}
$('thermoCells').addEventListener('click',e=>{const cell=e.target.closest('[data-cell]');if(cell){selected=Number(cell.dataset.cell);render();focus();}});
$('thermoCells').addEventListener('keydown',e=>{
 if(/^[1-9]$/.test(e.key)&&Number(e.key)<=size){e.preventDefault();change(Number(e.key));}
 else if(['Backspace','Delete','0'].includes(e.key)){e.preventDefault();change(0);}
 else if(e.key.toLowerCase()==='m'){e.preventDefault();toggleNotes();}
 else if(e.key.startsWith('Arrow')){const r=Math.floor(selected/size),c=selected%size;const next={ArrowLeft:r*size+Math.max(0,c-1),ArrowRight:r*size+Math.min(size-1,c+1),ArrowUp:Math.max(0,r-1)*size+c,ArrowDown:Math.min(size-1,r+1)*size+c}[e.key];if(next!==undefined){e.preventDefault();selected=next;render();focus();}}
});
$('thermoNumbers').addEventListener('click',e=>{const button=e.target.closest('[data-number]');if(button)change(Number(button.dataset.number));});
$('thermoNotes').addEventListener('click',toggleNotes);
$('thermoErase').addEventListener('click',()=>change(0));
$('thermoReset').addEventListener('click',()=>{if(ready&&confirm('입력한 숫자와 메모를 초기화할까요?')){values=givens.slice();notes=Array.from({length:size*size},()=>[]);update();}});
render();

if(!preview){
 window.checkComplete=checkComplete;
 window.handleCloudSave=()=>{if(ready)return window.saveProgressCloud(ID,state());};
 window.handleCloudLoad=async()=>{
  if(!ready||!confirm('저장된 진행 상황을 불러오시겠습니까?'))return;
  const saved=await window.loadProgressCloud(ID);if(saved==null)return;
  const next=parseState(puzzle,saved,ID);if(!next){window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.');return;}
  values=next.values;notes=next.notes;update();
 };
 function restore(){ready=false;completed=false;let saved=null;try{saved=window.loadLocalState(ID);}catch{}
  const next=parseState(puzzle,saved,ID);values=next?.values||givens.slice();notes=next?.notes||Array.from({length:size*size},()=>[]);ready=true;render();window.initCloudBtns();checkComplete();
 }
 window.puzzleAuthReady.then(restore);
 window.addEventListener('puzzle-auth-ready',restore);
}
