// Keep candidates behind a filled value; erase the value before its notes.
export function writeNumber(values, notes, index, number) {
  if (!number && !values[index]) notes[index] = [];
  values[index] = number;
}
