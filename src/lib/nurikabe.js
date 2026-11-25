export const size = 9;
export const clues = [
  [0, 0, 0, 0, 2, 0, 0, 0, 0],
  [0, 6, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 3, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 3, 0, 3],
  [0, 0, 0, 0, 5, 0, 0, 0, 0],
  [4, 0, 2, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 4, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 2, 0],
  [0, 0, 0, 0, 2, 0, 0, 0, 0],
].flat();

export const EMPTY = 0;
export const SHADED = 1;
export const NOTE = 2;

function neighbors(index) {
  const column = index % size;
  const result = [];
  if (index >= size) result.push(index - size);
  if (index < size * (size - 1)) result.push(index + size);
  if (column > 0) result.push(index - 1);
  if (column < size - 1) result.push(index + 1);
  return result;
}

export function inspectNurikabe(board, numbers = clues) {
  const isShaded = index => board[index] === SHADED;
  const visited = new Set();
  const conflicts = new Set();
  const clueStatuses = new Map();
  const satisfiedCells = new Set();
  let shadedRegions = 0;
  let validRegions = true;

  for (let index = 0; index < numbers.length; index++) {
    if (visited.has(index)) continue;
    const shaded = isShaded(index);
    if (shaded) shadedRegions++;

    const region = [index];
    visited.add(index);
    const regionClues = [];
    for (const cell of region) {
      if (numbers[cell]) regionClues.push(cell);
      if (shaded && cell % size < size - 1 && cell < size * (size - 1)) {
        const square = [cell, cell + 1, cell + size, cell + size + 1];
        if (square.every(isShaded)) square.forEach(index => conflicts.add(index));
      }

      for (const next of neighbors(cell)) {
        if (visited.has(next) || isShaded(next) !== shaded) continue;
        visited.add(next);
        region.push(next);
      }
    }

    if (shaded) {
      if (regionClues.length) validRegions = false;
    } else if (regionClues.length === 1) {
      const [clue] = regionClues;
      const matches = region.length === numbers[clue];
      clueStatuses.set(clue, matches ? 'satisfied' : 'conflict');
      if (matches) region.forEach(cell => satisfiedCells.add(cell));
      else validRegions = false;
    } else {
      validRegions = false;
    }
  }

  return { conflicts, clueStatuses, satisfiedCells, complete: validRegions && shadedRegions === 1 && conflicts.size === 0 };
}
