export const words = [
  'DEAL', 'CHALKED', 'WHALE', 'CALM', 'THING',
  'DYE', 'LEAKY', 'PANCAKE', 'ZUCCHINI', 'TWICE',
  'LEACHING', 'HAZELNUT', 'PRINCE', 'MAID', 'KIND',
  'STUN', 'CZECH', 'PUZZLE', 'GRAND', 'PRIX',
  'COST', 'HICCUP', 'WINGS', 'COUGAR', 'AXING',
  'GUST', 'SUGAR', 'SPARK', 'GRAIN', 'PARKING',
];

// Search only paths in the player's current letters, never possible solutions.
export function inspectAlphabetChoice(values, boardWords = words, columns = 5) {
  const neighbors = boardWords.map((_, index) => boardWords.flatMap((_, other) =>
    other !== index && Math.abs(Math.floor(index / columns) - Math.floor(other / columns)) <= 1 &&
    Math.abs(index % columns - other % columns) <= 1 ? [other] : []));
  const valid = values.length === boardWords.length && values.every(letter => letter === '' || typeof letter === 'string' && /^[A-Z]$/.test(letter));
  if (!valid) return { satisfied: boardWords.map(() => false), conflicts: new Set(), solved: false };
  const conflicts = new Set(boardWords.flatMap((word, index) => values[index] && !word.includes(values[index]) ? [index] : []));
  const satisfied = boardWords.map((word, target) => {
    function visit(index, offset, used, included) {
      if (values[index] !== word[offset] || used.has(index)) return false;
      const containsTarget = included || index === target;
      if (offset === word.length - 1) return containsTarget;
      used.add(index);
      const found = neighbors[index].some(next => visit(next, offset + 1, used, containsTarget));
      used.delete(index);
      return found;
    }
    return boardWords.some((_, index) => visit(index, 0, new Set(), false));
  });
  return { satisfied, conflicts, solved: !conflicts.size && values.every(Boolean) && satisfied.every(Boolean) };
}

export function parseAlphabetChoiceState(saved, puzzleId) {
  if (!saved || saved.version !== 1 || saved.puzzleId !== puzzleId || !Array.isArray(saved.values) ||
      saved.values.length !== words.length || !saved.values.every(letter =>
        letter === '' || typeof letter === 'string' && /^[A-Z]$/.test(letter))) return null;
  return { values: [...saved.values] };
}
