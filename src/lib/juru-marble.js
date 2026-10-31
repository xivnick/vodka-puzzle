// Follow only the currently known chain. Keep earlier glasses and derive later
// ones again after every edit so removed or changed inputs leave no stale marks.
export function traceGlasses(path, values) {
  const stops = [0];
  let distance = 0;
  while (distance < path.length) {
    const [r, c] = path[distance];
    const number = values[r * 9 + c];
    if (!number) break;
    distance += number;
    if (distance >= path.length) {
      if (distance > path.length) stops.push(distance % path.length);
      break;
    }
    stops.push(distance);
  }
  return { stops, distance };
}

export function stopConflicts(path, values, stops) {
  const cells = stops.map(index => {
    const [r, c] = path[index];
    return { r, c, cell: r * 9 + c };
  });
  const bad = new Set();
  const reasons = [];
  const rules = [
    ['정차 행 중복', ({ r }) => r],
    ['정차 열 중복', ({ c }) => c],
    ['정차 상자 중복', ({ r, c }) => Math.floor(r / 3) * 3 + Math.floor(c / 3)],
    ['정차 숫자 중복', ({ cell }) => values[cell] || null],
  ];
  for (const [reason, keyFor] of rules) {
    const groups = new Map();
    for (const cell of cells) {
      const key = keyFor(cell);
      if (key === null) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(cell.cell);
    }
    let conflict = false;
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      conflict = true;
      group.forEach(cell => bad.add(cell));
    }
    if (conflict) reasons.push(reason);
  }
  return { bad, reasons };
}
