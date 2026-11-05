// Compare the live renderer to the preserved, approved Astro preview after build.
// No browser dependencies or puzzle-solving checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
class Element {
  constructor(tag){this.tagName=tag;this.nodeType=1;this.attributes={};this.children=[];this.dataset={};this.style={cssText:''};this.className='';this.classList={contains:name=>this.className.split(' ').includes(name)};}
  setAttribute(name,value){this.attributes[name]=String(value);if(name==='class')this.className=String(value);}
  append(...children){this.children.push(...children);}
}
globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};
const {createBadgeEffect,cloneBadgeVisual}=await import('../src/scripts/nickname-badge-effects.js');
const approved=fs.readFileSync(new URL('../dist/test/achievement-badges/selected-effects/index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles/nickname-badge-effects.css',import.meta.url),'utf8');
const originalCss=fs.readFileSync(new URL('../src/pages/test/achievement-badges/selected-effects/index.astro',import.meta.url),'utf8');
const walk=node=>[node,...node.children.flatMap(walk)];
function reference(className,count){
 const tags=[...approved.matchAll(new RegExp(`<([a-zA-Z]+)\\b[^>]*class="${className}"[^>]*>`,'g'))].slice(0,count);
 assert.equal(tags.length,count,`${className} reference count`);
 return tags.map(([html,tagName])=>({tagName,attributes:Object.fromEntries([...html.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]))}));
}
for(const [effect,className,count] of [['ribbon','ribbon-light',1],['foil','foil-face',18],['interference','interference-stop',9],['lenticular','lenticular-slice',12],['afterglow','afterglow-light',1]]){
 const overlay=createBadgeEffect(effect),actual=walk(overlay).filter(n=>n.classList.contains(className)),expected=reference(className,count);
 assert(overlay.classList.contains('is-offscreen'),'effects must start paused');
 assert.equal(actual.length,count);
 for(let i=0;i<count;i++){
  assert.equal(actual[i].tagName,expected[i].tagName);
  for(const name of ['d','x','y','width','height','offset','stop-color','stop-opacity']){
   if(expected[i].attributes[name]!==undefined)assert.equal(actual[i].attributes[name],expected[i].attributes[name],`${effect} ${i} ${name}`);
  }
  const delay=expected[i].attributes.style?.match(/animation-delay:\s*([^;]+)/)?.[1]??expected[i].attributes.style?.match(/--phase:\s*([^;]+)/)?.[1];
  if(delay!==undefined)assert(Math.abs(parseFloat(actual[i].style.animationDelay)-parseFloat(delay))<1e-12,`${effect} phase ${i}`);
 }
}
function keyframes(source,name){
 const start=source.indexOf('@keyframes '+name);assert(start>=0,name);
 let index=source.indexOf('{',start),depth=1,end=index+1;
 for(;depth&&end<source.length;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}
 return source.slice(index+1,end-1).replace(/\s/g,'').replace(/;}/g,'}');
}
for(const [live,original] of [['badge-ribbon-light','material-ribbon'],['badge-foil-face','material-foil'],['badge-interference-stop','material-interference'],['badge-lenticular-slice','material-lenticular'],['badge-afterglow-light','white-afterglow']])assert.equal(keyframes(css,live),keyframes(originalCss,original),live);
for(const [className,period,easing] of [['ribbon-light','1.9s','linear'],['foil-face','5.2s','linear'],['interference-stop','3.2s','ease-in-out'],['lenticular-slice','2.1s','ease-in-out'],['afterglow-light','4.2s','ease-out']]){
 const animation=css.match(new RegExp('\\.'+className+'\\{animation:([^}]+)\\}'))?.[1];
 assert(animation?.includes(`${period} ${easing} infinite`),className+' timing');
}
const ribbon=walk(createBadgeEffect('ribbon')).find(n=>n.tagName==='linearGradient');
assert.equal(ribbon.attributes.gradientTransform,'matrix(1 0 -.25 1 .125 0)');
assert.deepEqual(ribbon.children.map(n=>[n.attributes.offset,n.attributes['stop-opacity']]),[['0','0'],['0.43','0'],['0.5','0.95'],['0.57','0'],['1','0']]);
const radial=walk(createBadgeEffect('interference')).find(n=>n.tagName==='radialGradient');
assert.deepEqual([radial.attributes.cx,radial.attributes.cy,radial.attributes.r],['0.3','0.35','0.9']);
const interference=createBadgeEffect('interference');interference.style.cssText='mask-image:url(test.svg)';
const copy=cloneBadgeVisual(interference);
assert.equal(copy.style.cssText,interference.style.cssText);
const firstIds=walk(interference).map(n=>n.attributes.id).filter(Boolean),copyIds=walk(copy).map(n=>n.attributes.id).filter(Boolean);
assert(firstIds.length>0&&copyIds.every(id=>!firstIds.includes(id)),'gradient IDs must be unique when copying account badges');
const allIds=[];
for(let i=0;i<100;i++)allIds.push(...walk(createBadgeEffect(['ribbon','foil','interference','lenticular','afterglow'][i%5])).map(n=>n.attributes.id).filter(Boolean));
assert.equal(new Set(allIds).size,allIds.length);
for(const rule of ['.page-hidden .custom-badge-effect *','.custom-badge-effect.is-offscreen *','prefers-reduced-motion:reduce'])assert(css.includes(rule),rule);
assert(!css.includes('conic-gradient')&&!css.includes('repeating-radial-gradient'));
console.log('Approved geometry, all five animation curves, per-element phases, unique gradient IDs, clone isolation and pause/reduced-motion hooks: passed');
