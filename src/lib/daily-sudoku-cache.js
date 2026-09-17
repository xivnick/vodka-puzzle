const KEY = 'daily-sudoku:puzzle-cache';
export function readPuzzleCache(storage, today, requestedDay = null) {
 try {
  const cache = JSON.parse(storage.getItem(KEY));
  if (!cache) return null;
  if (cache.version !== 1 || cache.day !== today || !/^[0-9]{81}$/.test(cache.givens)) {
   storage.removeItem(KEY); return null;
  }
  if (requestedDay && requestedDay !== today) return null;
  return { day:cache.day, current_day:today, available:true, givens:cache.givens };
 } catch { return null; }
}
export function writePuzzleCache(storage, puzzle) {
 try {
  if (!puzzle.available || puzzle.day !== puzzle.current_day) return;
  storage.setItem(KEY, JSON.stringify({version:1, day:puzzle.day, givens:puzzle.givens}));
 } catch {}
}
export function clearPuzzleCache(storage) { try { storage.removeItem(KEY); } catch {} }
