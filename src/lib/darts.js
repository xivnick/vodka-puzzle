export const dartsPuzzles = {
  '261104_01': { number: 1, target: 2021, darts: 4, scores: [549, 488, 198, 448, 512, 966, 543, 753, 409, 212, 565, 200, 1410] },
  '261104_02': { number: 2, target: 1484, darts: 4, scores: [5, 37, 14, 87, 21, 99, 1240, 38, 1274, 120, 78, 1266, 55] },
};

export function inspectDarts(selected, puzzle) {
  const valid = Array.isArray(selected) && selected.length <= puzzle.darts &&
    new Set(selected).size === selected.length && selected.every(index => Number.isInteger(index) && index >= 0 && index < puzzle.scores.length);
  const sum = valid ? selected.reduce((total, index) => total + puzzle.scores[index], 0) : 0;
  return { valid, sum, solved: valid && selected.length === puzzle.darts && sum === puzzle.target };
}

export function parseDartsState(saved, puzzleId) {
  const puzzle = dartsPuzzles[puzzleId];
  if (!puzzle || !saved || saved.version !== 1 || saved.puzzleId !== puzzleId || !inspectDarts(saved.selected, puzzle).valid) return null;
  let placements = saved.placements;
  if (placements !== undefined) {
    if (!Array.isArray(placements) || placements.length !== saved.selected.length || !placements.every((hit, i) =>
      hit && hit.index === saved.selected[i] && [hit.x,hit.y,hit.angle].every(Number.isFinite) && hit.angle >= -28 && hit.angle <= 14 &&
      dartTipInside(hit.index,hit.x,hit.y) && dartClearsLabels(hit,puzzle))) return null;
  } else {
    // Older saves get repeatable placements without changing their selected scores.
    placements = saved.selected.map(index => {
      let seed = index + 1;
      return createDartPlacement(index,puzzle,() => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed/4294967296; });
    });
    if (placements.some(hit => !hit)) return null;
  }
  return { selected: [...saved.selected], placements: placements.map(hit => ({...hit})) };
}

// Clockwise quadrants start at the upper left, matching the supplied boards.
export function dartRegion(index) {
  if (index === 12) return { path: 'M 273 240 A 33 33 0 1 0 207 240 A 33 33 0 1 0 273 240 Z', x: 240, y: 240 };
  const quadrant = index % 4;
  const [inner, outer] = [[154, 220], [88, 154], [33, 88]][Math.floor(index / 4)];
  const start = (quadrant * 90 + 180) * Math.PI / 180;
  const end = start + Math.PI / 2;
  const point = (radius, angle) => [240 + radius * Math.cos(angle), 240 + radius * Math.sin(angle)];
  const a = point(outer, start), b = point(outer, end), c = point(inner, end), d = point(inner, start);
  const [x, y] = point((inner + outer) / 2, (start + end) / 2);
  return { path: `M ${a} A ${outer} ${outer} 0 0 1 ${b} L ${c} A ${inner} ${inner} 0 0 0 ${d} Z`, x, y };
}

export function dartTipInside(index, x, y) {
  const dx = x - 240, dy = y - 240, radius = Math.hypot(dx, dy);
  if (index === 12) return radius <= 27;
  const [inner, outer] = [[154, 220], [88, 154], [33, 88]][Math.floor(index / 4)];
  const quadrant = dx < 0 ? (dy < 0 ? 0 : 3) : (dy < 0 ? 1 : 2);
  return quadrant === index % 4 && Math.abs(dx) >= 6 && Math.abs(dy) >= 6 && radius >= inner + 6 && radius <= outer - 6;
}

// Keep the entire dart silhouette clear of every number, including neighboring regions.
export function dartClearsLabels(placement, puzzle) {
  const { x, y, angle } = placement;
  const direction = (70 + angle) * Math.PI / 180;
  return puzzle.scores.every((score, index) => {
    const label = dartRegion(index);
    // The needle is thin; the shaft and flights widen toward the tail.
    return [[0,25,1.5],[25,46,3],[46,67,8]].every(([start,end,padding]) => {
      const originX = x + start*Math.cos(direction), originY = y + start*Math.sin(direction);
      const vx = (end-start)*Math.cos(direction), vy = (end-start)*Math.sin(direction);
      const halfWidth = String(score).length*6.2 + padding + 2, halfHeight = 12 + padding + 2;
      let near = 0, far = 1;
      for (const [origin,velocity,low,high] of [[originX,vx,label.x-halfWidth,label.x+halfWidth],[originY,vy,label.y-halfHeight,label.y+halfHeight]]) {
        if (Math.abs(velocity) < .0001) { if (origin < low || origin > high) return true; }
        else {
          const a=(low-origin)/velocity, b=(high-origin)/velocity;
          near=Math.max(near,Math.min(a,b)); far=Math.min(far,Math.max(a,b));
          if (near>far) return true;
        }
      }
      return false;
    });
  });
}

export function createDartPlacement(index, puzzle, random = Math.random) {
  for (let attempt = 0; attempt < 1200; attempt++) {
    let x, y;
    if (index === 12) { x = 240 + (random()*2-1)*27; y = 240 + (random()*2-1)*27; }
    else {
      const [inner, outer] = [[154,220],[88,154],[33,88]][Math.floor(index/4)];
      const radius = inner + 6 + random()*(outer-inner-12);
      const theta = (180 + index%4*90 + random()*90)*Math.PI/180;
      x = 240 + radius*Math.cos(theta); y = 240 + radius*Math.sin(theta);
    }
    const placement = { index, x, y, angle: random()*42-28 };
    if (dartTipInside(index,x,y) && dartClearsLabels(placement,puzzle)) return placement;
  }
  // Tight inner regions have few clear trajectories; use a bounded grid fallback.
  const radius = index === 12 ? 27 : [220,154,88][Math.floor(index/4)];
  const candidates = [];
  for (let x=240-radius; x<=240+radius; x+=2) for (let y=240-radius; y<=240+radius; y+=2) {
    if (!dartTipInside(index,x,y)) continue;
    for (let angle=-28; angle<=14; angle+=2) {
      const hit={index,x,y,angle};
      if (dartClearsLabels(hit,puzzle)) candidates.push(hit);
    }
  }
  return candidates.length ? candidates[Math.floor(random()*candidates.length)] : null;
}
