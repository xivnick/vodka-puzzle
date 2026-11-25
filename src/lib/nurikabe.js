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

export function isNurikabeComplete(board, numbers = clues) {
  const isShaded = index => board[index] === SHADED;
  const visited = new Set();
  let shadedRegions = 0;

  for (let index = 0; index < numbers.length; index++) {
    if (visited.has(index)) continue;
    const shaded = isShaded(index);
    if (shaded && ++shadedRegions > 1) return false;

    const region = [index];
    visited.add(index);
    let clue = 0;
    for (const cell of region) {
      if (numbers[cell]) {
        if (shaded || clue) return false;
        clue = numbers[cell];
      }
      if (shaded && cell % size < size - 1 && cell < size * (size - 1)
        && isShaded(cell + 1) && isShaded(cell + size) && isShaded(cell + size + 1)) return false;

      for (const next of neighbors(cell)) {
        if (visited.has(next) || isShaded(next) !== shaded) continue;
        visited.add(next);
        region.push(next);
      }
    }

    if (!shaded && region.length !== clue) return false;
  }

  return shadedRegions === 1;
}
