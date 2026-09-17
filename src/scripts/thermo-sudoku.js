import {puzzles,conflicts,solved} from '../lib/thermo-sudoku.js';
const $=id=>document.getElementById(id);
const puzzle=puzzles.find(p=>p.id===$('thermoGame').dataset.difficulty);
const givens=puzzle.givens.flat();
let values=givens.slice(),notes=Array.from({length:81},()=>[]),selected=0,notesMode=false;
function render(){
 const bad=conflicts(puzzle,values);
 for(const cell of $('thermoCells').children){const i=Number(cell.dataset.cell);cell.classList.toggle('selected',i===selected);cell.classList.toggle('conflict',bad.has(i));cell.tabIndex=i===selected?0:-1;cell.setAttribute('aria-label',`${Math.floor(i/9)+1}행 ${i%9+1}열, ${values[i]||'빈칸'}${givens[i]?', 고정 숫자':''}${bad.has(i)?', 규칙 위반':''}${!values[i]&&notes[i].length?`, 메모 ${notes[i].join(', ')}`:''}`);cell.replaceChildren();if(values[i])cell.textContent=values[i];else{const box=document.createElement('span');box.className='notes';box.setAttribute('aria-hidden','true');for(let n=1;n<=9;n++){const span=document.createElement('span');span.textContent=notes[i].includes(n)?n:'';box.append(span);}cell.append(box);}}
 $('thermoComplete').hidden=!solved(puzzle,values);
}
function focus(){document.querySelector(`[data-cell="${selected}"]`).focus();}
function change(n){if(givens[selected])return;if(notesMode&&n){if(values[selected])return;notes[selected]=notes[selected].includes(n)?notes[selected].filter(v=>v!==n):[...notes[selected],n];}else{values[selected]=n;notes[selected]=[];}render();}
function toggleNotes(){notesMode=!notesMode;$('thermoNotes').setAttribute('aria-pressed',String(notesMode));}
$('thermoCells').addEventListener('click',e=>{const cell=e.target.closest('[data-cell]');if(cell){selected=Number(cell.dataset.cell);render();focus();}});
$('thermoCells').addEventListener('keydown',e=>{
 if(/^[1-9]$/.test(e.key)){e.preventDefault();change(Number(e.key));}
 else if(['Backspace','Delete','0'].includes(e.key)){e.preventDefault();change(0);}
 else if(e.key.toLowerCase()==='m'){e.preventDefault();toggleNotes();}
 else if(e.key.startsWith('Arrow')){const r=Math.floor(selected/9),c=selected%9;const next={ArrowLeft:r*9+Math.max(0,c-1),ArrowRight:r*9+Math.min(8,c+1),ArrowUp:Math.max(0,r-1)*9+c,ArrowDown:Math.min(8,r+1)*9+c}[e.key];if(next!==undefined){e.preventDefault();selected=next;render();focus();}}
});
$('thermoNumbers').addEventListener('click',e=>{const button=e.target.closest('[data-number]');if(button)change(Number(button.dataset.number));});
$('thermoNotes').addEventListener('click',toggleNotes);
$('thermoErase').addEventListener('click',()=>change(0));
$('thermoReset').addEventListener('click',()=>{if(confirm('입력한 숫자와 메모를 초기화할까요?')){values=givens.slice();notes=Array.from({length:81},()=>[]);render();}});
render();
