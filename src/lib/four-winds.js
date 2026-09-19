export const fourWindsPuzzles = [
  {
    id: 'photo-20260919-1',
    label: '사풍(四風) - 1',
    cells: [
      [2, 0, 0, 0, 1, 0, -1, -1],
      [0, 6, 0, 0, 0, 5, 0, 0],
      [0, 0, 5, 0, 0, 0, 3, 0],
      [0, 0, 0, 4, 0, 0, 0, 1],
      [2, 0, 0, 0, 3, 0, 0, 0],
      [0, 4, 0, 0, 0, 2, 0, 0],
      [-1, 0, 1, 0, 0, 0, 1, 0],
      [-1, 0, 0, 3, 0, 0, 0, 1],
    ],
  },
  {
    id: 'photo-20260919-2',
    label: '사풍(四風) - 2',
    cells: [
      [0, 5, 0, 0, 0, 0, 2, 0, 0, 0],
      [0, 0, 0, 0, 4, 0, 0, 0, 0, 3],
      [0, 0, 4, 0, 0, 0, 0, 6, 0, 0],
      [5, 0, 0, 0, 0, 3, 0, 0, 0, 0],
      [0, 0, 0, 7, 0, 0, 0, 0, 2, 0],
      [0, 5, 0, 0, 0, 0, 4, 0, 0, 0],
      [0, 0, 0, 0, 9, 0, 0, 0, 0, 3],
      [0, 0, 4, 0, 0, 0, 0, 3, 0, 0],
      [4, 0, 0, 0, 0, 3, 0, 0, 0, 0],
      [0, 0, 0, 2, 0, 0, 0, 0, 2, 0],
    ],
  },
];

export const cellKey = ({ r, c }) => `${r}:${c}`;

export function arrowCells(arrow) {
  const dr = Math.sign(arrow.end.r - arrow.source.r);
  const dc = Math.sign(arrow.end.c - arrow.source.c);
  const length = Math.abs(arrow.end.r - arrow.source.r) + Math.abs(arrow.end.c - arrow.source.c);
  return Array.from({ length }, (_, i) => ({ r: arrow.source.r + dr * (i + 1), c: arrow.source.c + dc * (i + 1) }));
}

export function validateArrow(puzzle, arrow, arrows = []) {
  const { cells } = puzzle;
  const sourceValue = cells[arrow.source.r]?.[arrow.source.c];
  if (!(sourceValue > 0)) return '숫자가 있는 칸에서 시작하세요.';
  if (arrow.source.r !== arrow.end.r && arrow.source.c !== arrow.end.c) return '화살표는 가로 또는 세로로만 그릴 수 있습니다.';
  const covered = arrowCells(arrow);
  if (!covered.length) return '화살표가 차지할 빈 칸을 선택하세요.';
  const occupied = new Set(arrows.flatMap(existing => arrowCells(existing).map(cellKey)));
  for (const cell of covered) {
    if (cells[cell.r]?.[cell.c] !== 0) return '화살표는 빈 칸 안에서만 뻗을 수 있습니다.';
    if (occupied.has(cellKey(cell))) return '이미 다른 화살표가 차지한 칸입니다.';
  }
  return null;
}

export function analyzeFourWinds(puzzle, arrows) {
  const occupied = new Map();
  const totals = new Map();
  const errors = [];
  arrows.forEach((arrow, index) => {
    const error = validateArrow(puzzle, arrow, arrows.slice(0, index));
    if (error) errors.push(error);
    const source = cellKey(arrow.source);
    totals.set(source, (totals.get(source) || 0) + arrowCells(arrow).length);
    for (const cell of arrowCells(arrow)) occupied.set(cellKey(cell), index);
  });
  let emptyCount = 0;
  let cluesComplete = true;
  puzzle.cells.forEach((row, r) => row.forEach((value, c) => {
    if (value === 0 && !occupied.has(cellKey({ r, c }))) emptyCount += 1;
    if (value > 0 && (totals.get(cellKey({ r, c })) || 0) !== value) cluesComplete = false;
  }));
  return { occupied, totals, errors, emptyCount, complete: errors.length === 0 && emptyCount === 0 && cluesComplete };
}

export function parseFourWindsState(puzzle, saved, puzzleId) {
  if (!saved || saved.version !== 1 || saved.puzzleId !== puzzleId || !Array.isArray(saved.arrows)) return null;
  const arrows = [];
  for (const item of saved.arrows) {
    if (!item || !item.source || !item.end) return null;
    const values = [item.source.r, item.source.c, item.end.r, item.end.c];
    if (!values.every(Number.isInteger)) return null;
    const arrow = { source: { r: item.source.r, c: item.source.c }, end: { r: item.end.r, c: item.end.c } };
    if (validateArrow(puzzle, arrow, arrows)) return null;
    arrows.push(arrow);
  }
  return arrows;
}
