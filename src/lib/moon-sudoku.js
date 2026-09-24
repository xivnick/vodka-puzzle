// Rows run from the moon's centre outwards; columns run clockwise from noon.
export const givens = [
  [1, 0, 0, 4, 0, 6],
  [0, 5, 6, 0, 2, 0],
  [2, 0, 4, 0, 0, 1],
  [0, 6, 0, 2, 3, 0],
  [3, 0, 5, 0, 1, 0],
  [0, 1, 0, 3, 0, 5],
];

export const units = [
  ...Array.from({length: 6}, (_, r) => Array.from({length: 6}, (_, c) => r * 6 + c)),
  ...Array.from({length: 6}, (_, c) => Array.from({length: 6}, (_, r) => r * 6 + c)),
  ...Array.from({length: 6}, (_, b) => Array.from({length: 6}, (_, n) =>
    (Math.floor(b / 2) * 2 + Math.floor(n / 3)) * 6 + (b % 2) * 3 + n % 3)),
];

export function conflicts(values) {
  const bad = new Set();
  for (const unit of units) {
    for (const i of unit) {
      if (values[i] && unit.some(j => j !== i && values[j] === values[i])) bad.add(i);
    }
  }
  return bad;
}

export function solved(values) {
  return values.length === 36 && values.every((n, i) =>
    Number.isInteger(n) && n >= 1 && n <= 6 && (!givens.flat()[i] || givens.flat()[i] === n)
  ) && conflicts(values).size === 0;
}

export function point(radius, angle) {
  const radians = (angle - 90) * Math.PI / 180;
  return [220 + radius * Math.cos(radians), 220 + radius * Math.sin(radians)];
}

export function cellPath(ring, sector) {
  const inner = ring * 35, outer = (ring + 1) * 35;
  const start = sector * 60, end = start + 60;
  const a = point(outer, start), b = point(outer, end);
  if (!inner) return `M220,220 L${a} A${outer},${outer} 0 0 1 ${b} Z`;
  return `M${a} A${outer},${outer} 0 0 1 ${b} L${point(inner, end)} A${inner},${inner} 0 0 0 ${point(inner, start)} Z`;
}
