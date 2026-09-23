import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { balanceLoopPuzzles, edgeKey, validateBalanceLoop, parseBalanceLoopState } from '../src/lib/balance-loop.js';
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
test('previews stay isolated while official pages have catalog entries and saving',()=>{
  const catalog=readFileSync(new URL('../src/data/puzzles.json',import.meta.url),'utf8');
  assert.ok(!catalog.includes('balance-loop'));
  const script=readFileSync(new URL('../src/scripts/balance-loop.js',import.meta.url),'utf8');
  assert.match(script,/if\(preview \|\| !ready/);
  assert.match(script,/window\.puzzleAuthReady\.then\(init\)/);
  for(const n of [1,2]) {
    const html=readFileSync(new URL(`../dist/test/balance-loop/260923-${n}/index.html`,import.meta.url),'utf8');
    const official=readFileSync(new URL(`../dist/260923_0${n}/index.html`,import.meta.url),'utf8');
    assert.ok(official.includes('data-preview="false"'));
    assert.ok(official.includes(`data-puzzle-id="260923_0${n}"`));
    assert.ok(official.includes('id="cloudBtns"') && official.includes('id="leaderboard"'));
    assert.ok(catalog.includes(`"id": "260923_0${n}"`));
    assert.ok(html.includes('data-preview="true"'));
    assert.ok(html.includes(`260923 밸런스 루프 ${n}`));assert.ok(!html.includes('id="cloudBtns"'));assert.ok(!html.includes('id="leaderboard"'));
  }
});

test('saved edges must match puzzle, version and grid, but may contain unfinished or invalid play',()=>{
  const clues=grid(), valid={version:1,puzzleId:'sample',edges:['0:1','1:2','1:6']};
  assert.deepEqual([...parseBalanceLoopState(clues,valid,'sample')],valid.edges);
  for(const saved of [null,{...valid,version:2},{...valid,puzzleId:'other'},{...valid,edges:['4:5']},{...valid,edges:['0:1','0:1']},{...valid,edges:['00:1']},{...valid,edges:[{}]},{...valid,edges:'0:1'}]) {
    assert.equal(parseBalanceLoopState(clues,saved,'sample'),null);
  }
});

test('runtime isolates previews, restores per account and records a completed input only once',async()=>{
  const {runInNewContext}=await import('node:vm');
  const source=readFileSync(new URL('../src/scripts/balance-loop.js',import.meta.url),'utf8').replace(/^import .*;\n/,'');
  async function setup(preview) {
    const nodes=new Map(), events={}, writes=[], records=[];
    for(const id of ['balanceGame','balanceBoard','balanceStatus','balanceUndo','balanceComplete','balanceReset']) nodes.set(id,{dataset:{},handlers:{},setAttribute(){},addEventListener(name,fn){this.handlers[name]=fn;}});
    nodes.get('balanceGame').dataset={clues:JSON.stringify(grid()),preview:String(preview),puzzleId:'sample'};
    const window={puzzleAccount:{user:{id:'a'}},puzzleAuthReady:Promise.resolve(),addEventListener(name,fn){events[name]=fn;},initCloudBtns(){},showToast(){},loadLocalState(){return window.puzzleAccount.user.id==='a'?{version:1,puzzleId:'sample',edges:[...rectangle()]}:null;},saveLocalState(id,state){writes.push({owner:window.puzzleAccount.user.id,state});},recordCompletion(id,state){records.push(state);},saveProgressCloud(){},loadProgressCloud:async()=>null};
    runInNewContext(source,{window,document:{getElementById:id=>nodes.get(id)},edgeKey,validateBalanceLoop,parseBalanceLoopState});
    await Promise.resolve();
    return {nodes,events,window,writes,records};
  }
  const preview=await setup(true);
  assert.equal(preview.writes.length,0);assert.equal(preview.records.length,0);
  assert.equal(preview.window.handleCloudSave,undefined);
  const board=preview.nodes.get('balanceBoard');
  board.focus=()=>{};board.setPointerCapture=()=>{};
  board.getBoundingClientRect=()=>({left:0,top:0,width:200,height:200});
  const pointer=(type,x,y)=>board.handlers[type]({type,pointerId:1,button:0,clientX:x,clientY:y,preventDefault(){},target:{closest(){return null;}}});
  const click=(x,y)=>{pointer('pointerdown',x,y);pointer('pointerup',x,y);};
  const lineCount=()=> (board.innerHTML.match(/data-edge=/g)||[]).length;
  click(20,20);click(140,20);
  assert.equal(lineCount(),3);
  assert.doesNotMatch(board.innerHTML,/#e7eef7/);
  click(140,140);
  assert.equal(lineCount(),3,'the next click starts a fresh selection');
  pointer('pointerdown',140,140);pointer('pointermove',20,140);pointer('pointerup',20,140);
  assert.equal(lineCount(),6);
  assert.doesNotMatch(board.innerHTML,/#e7eef7/);
  click(20,60);
  assert.equal(lineCount(),6,'drag completion also clears the connection origin');

  const normal=await setup(false);
  assert.equal(normal.records.length,1);assert.equal(normal.nodes.get('balanceComplete').hidden,false);
  normal.nodes.get('balanceBoard').handlers.keydown({key:'ArrowRight',preventDefault(){}});
  assert.equal(normal.records.length,1);
  normal.window.puzzleAccount.user={id:'b'};normal.events['puzzle-auth-ready']();
  assert.equal(normal.nodes.get('balanceComplete').hidden,true);
  assert.equal(normal.writes.at(-1).owner,'b');assert.equal(normal.writes.at(-1).state.edges.length,0);
});
