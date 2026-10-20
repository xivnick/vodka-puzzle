// Validate only the player's board; no solution search is needed.
export function inspectProduct(values, rows, columns) {
  const size = rows.length;
  const max = size * 2;
  const conflicts = new Set();
  const counts = new Map();
  values.forEach((value, index) => {
    if (value > 0) {
      if (!Number.isInteger(value) || value > max) conflicts.add(index);
      if (!counts.has(value)) counts.set(value, []);
      counts.get(value).push(index);
    }
  });
  for (const indices of counts.values()) if (indices.length > 1) indices.forEach(index => conflicts.add(index));
  const inspectLine = (indices, clue) => {
    const filled = indices.filter(index => values[index] > 0);
    const product = filled.reduce((total, index) => total * values[index], 1);
    const error = filled.length > 2 || (filled.length === 2 && product !== clue);
    if (error) filled.forEach(index => conflicts.add(index));
    return { error, satisfied: filled.length === 2 && product === clue };
  };
  const rowStates = rows.map((clue, row) => inspectLine(Array.from({length:size}, (_, column) => row*size+column), clue));
  const columnStates = columns.map((clue, column) => inspectLine(Array.from({length:size}, (_, row) => row*size+column), clue));
  return { conflicts, rowStates, columnStates, solved: values.length === size*size && counts.size === max && !conflicts.size && [...rowStates,...columnStates].every(line => line.satisfied) };
}

export function parseProductState(saved, puzzleId, size) {
  const valid = value => Number.isInteger(value) && value >= -1 && value <= size*2;
  if (!saved || saved.version !== 1 || saved.puzzleId !== puzzleId || !Array.isArray(saved.values) || saved.values.length !== size*size || !saved.values.every(valid)) return null;
  return { values:[...saved.values] };
}
