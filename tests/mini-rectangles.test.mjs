import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blocked,normalize,validateRect,parseState,analyze} from '../src/lib/mini-rectangles.js';
test('photo board has 65 white cells and 16 holes',()=>{
 let holes=0;for(let r=0;r<9;r++)for(let c=0;c<9;c++)holes+=Number(blocked(r,c));assert.equal(holes,16);
});
test('reverse drags normalize; holes, overlaps and malformed saves are rejected',()=>{
 const q=normalize({r:0,c:8},{r:0,c:0});assert.deepEqual(q,{r0:0,c0:0,r1:0,c1:8});assert.equal(validateRect(q),'');
 assert.ok(validateRect({r0:0,c0:0,r1:2,c1:2}));assert.ok(validateRect(q,[q]));
 assert.equal(parseState({version:1,rects:[q,q]}),null);assert.equal(parseState({version:1,rects:[{...q,c1:9}]}),null);
 assert.deepEqual(parseState({version:1,rects:[q]}),[q]);
});
test('coverage alone does not complete a board containing squares',()=>{
 const singletons=[];for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(!blocked(r,c))singletons.push({r0:r,r1:r,c0:c,c1:c});
 assert.deepEqual(analyze(singletons),{covered:65,remaining:0,squares:65,complete:false});
 assert.deepEqual(analyze([{r0:0,r1:0,c0:0,c1:8}]),{covered:9,remaining:56,squares:0,complete:false});
});
