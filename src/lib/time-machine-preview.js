// Dedicated to the unlisted example. No production keys or account APIs.
const storageKey = 'vodka-time-machine-preview-v1';
export const firstDay = -11; // 2026-09-19, relative to 2026-10-01.
export const today = 11;
export const isPreviewDay = day => Number.isInteger(day) && day >= firstDay && day <= today;
export const wasCompleted = day => day >= -3 && day <= 8; // 12 completed dates.
export const dateForDay = day => new Date(Date.UTC(2026, 9, day));
export const titleForDay = day => {
  const date = dateForDay(day);
  return `${String(date.getUTCFullYear()).slice(-2)}${String(date.getUTCMonth() + 1).padStart(2,'0')}${String(date.getUTCDate()).padStart(2,'0')} Daily Sudoku`;
};
export const solution = Array.from({length:81}, (_, i) => (Math.floor(i / 9) * 3 + Math.floor(Math.floor(i / 9) / 3) + i % 9) % 9 + 1);
export function createBoard(day) {
  const givens = solution.map((number, i) => ((i * 17 + day * 7) % 11 + 11) % 11 < 5 ? number : 0);
  return {givens, values:[...givens], notes:Array.from({length:81}, () => new Set()), complete:false};
}
export function readPreview() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(storageKey));
    if (stored && Number.isInteger(stored.tickets) && stored.tickets >= 0 && stored.tickets <= 2 && Array.isArray(stored.boards)) {
      const boards = new Map();
      for (const [day, board] of stored.boards) {
        if (!isPreviewDay(day) || !Array.isArray(board.values) || board.values.length !== 81 || !board.values.every(n => Number.isInteger(n) && n >= 0 && n <= 9) || !Array.isArray(board.notes) || board.notes.length !== 81) throw new Error('Invalid preview state');
        boards.set(day, {...createBoard(day), values:board.values, notes:board.notes.map(notes => new Set(Array.isArray(notes) ? notes.filter(n => Number.isInteger(n) && n >= 1 && n <= 9) : [])), complete:board.complete === true});
      }
      if (boards.has(11)) return {tickets:stored.tickets, boards};
    }
  } catch {}
  return {tickets:2, boards:new Map([[11, createBoard(11)]])};
}
export function savePreview({tickets, boards}) {
  try { sessionStorage.setItem(storageKey, JSON.stringify({tickets, boards:[...boards].map(([day, board]) => [day, {...board, notes:board.notes.map(notes => [...notes])}])})); } catch {}
}
export function resetPreview() { try { sessionStorage.removeItem(storageKey); } catch {} }
