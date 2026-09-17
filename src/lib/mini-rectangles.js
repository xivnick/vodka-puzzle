export const SIZE = 9;
export const blocked = (r, c) => r % 2 === 1 && c % 2 === 1;
export function normalize(a, b) {
  return { r0: Math.min(a.r,b.r), c0: Math.min(a.c,b.c), r1: Math.max(a.r,b.r), c1: Math.max(a.c,b.c) };
}
export function contains(rect,r,c) { return r>=rect.r0 && r<=rect.r1 && c>=rect.c0 && c<=rect.c1; }
export function validateRect(rect, rects=[]) {
  if (!rect || !['r0','c0','r1','c1'].every(k=>Number.isInteger(rect[k]) && rect[k]>=0 && rect[k]<SIZE) || rect.r0>rect.r1 || rect.c0>rect.c1) return '올바른 칸 범위가 아닙니다.';
  for(let r=rect.r0;r<=rect.r1;r++) for(let c=rect.c0;c<=rect.c1;c++) {
    if(blocked(r,c)) return '검은 칸을 포함할 수 없습니다.';
    if(rects.some(q=>contains(q,r,c))) return '기존 직사각형과 겹칩니다.';
  }
  return '';
}
export function parseState(state) {
  if(state?.version!==1 || !Array.isArray(state.rects) || state.rects.length>65) return null;
  const rects=[];
  for(const rect of state.rects) {
    if(validateRect(rect,rects)) return null;
    rects.push({r0:rect.r0,c0:rect.c0,r1:rect.r1,c1:rect.c1});
  }
  return rects;
}
export function analyze(rects) {
  let covered=0,squares=0;
  for(const rect of rects) {
    const h=rect.r1-rect.r0+1,w=rect.c1-rect.c0+1;
    covered+=h*w; if(h===w) squares++;
  }
  return {covered,remaining:65-covered,squares,complete:covered===65 && squares===0};
}
