const row = {puzzle_id:'__ui_preview',title:'난이도 드롭다운 시연',summary:'난이도를 선택한 뒤 변경사항을 저장해 보세요.',puzzle_type:'스도쿠',difficulty:2,status:'test',published_at:null,sort_order:0,updated_at:'2026-10-25T00:00:00Z'};
const sampleRows = [{...row, sort_order:1},
  {...row, puzzle_id:'__ui_sudoku', title:'스도쿠 시연', status:'published', published_at:'2026-10-25T00:00:00Z'},
  {...row, puzzle_id:'__ui_maze', title:'미로 시연', puzzle_type:'미로', status:'draft'},
  {...row, puzzle_id:'__ui_stars', title:'별 배치 시연', puzzle_type:'별 배치', difficulty:3},
  {...row, puzzle_id:'__ui_loop', title:'격자 위 단서를 따라 하나의 고리를 완성하는 퍼즐 시연', puzzle_type:'고리', difficulty:1},
  {...row, puzzle_id:'__ui_blocks', title:'블록 배치 시연', puzzle_type:'블록 배치', difficulty:0},
  {...row, puzzle_id:'__ui_arrows', title:'화살표 시연', puzzle_type:'화살표', status:'draft'},
];
export async function mockAdmin() {
  await window.puzzleAuthReady;
  const key = 'admin-preview-puzzles';
  const rows = JSON.parse(sessionStorage.getItem(key) || 'null') || sampleRows;

  window.puzzleAccount = {
    ...window.puzzleAccount,
    user: {id:'ui-preview'},
    client: {
      async rpc(name, args) {
        if (name === 'is_puzzle_admin') return {data:true};
        if (name === 'admin_list_puzzles') return {data:rows};
        if (name === 'admin_update_puzzle') {
          const row = rows.find(row => row.puzzle_id === args.requested_puzzle);
          if (!row) return {error:new Error('시연 문제를 찾을 수 없습니다.')};
          for (const [key, value] of Object.entries(args)) {
            if (key.startsWith('new_')) row[key === 'new_type' ? 'puzzle_type' : key.slice(4)] = value;
          }
          row.updated_at = new Date().toISOString();
          sessionStorage.setItem(key, JSON.stringify(rows));
          return {data:{...row}};
        }
        return {error:new Error('시연에서 지원하지 않는 작업입니다.')};
      },
    },
  };
}
