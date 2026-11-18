const row = {puzzle_id:'__ui_preview',title:'난이도 선택 시연',summary:'난이도를 선택한 뒤 변경사항을 저장해 보세요.',difficulty:2,status:'test',published_at:null,sort_order:0,updated_at:'2026-10-25T00:00:00Z'};
export async function mockAdmin() {
  await window.puzzleAuthReady;

  window.puzzleAccount = {
    ...window.puzzleAccount,
    user: {id:'ui-preview'},
    client: {
      async rpc(name, args) {
        if (name === 'is_puzzle_admin') return {data:true};
        if (name === 'admin_list_puzzles') return {data:[row]};
        if (name === 'admin_update_puzzle') {
          if (args.requested_puzzle !== row.puzzle_id) return {error:new Error('시연 문제를 찾을 수 없습니다.')};
          for (const [key, value] of Object.entries(args)) {
            if (key.startsWith('new_')) row[key.slice(4)] = value;
          }
          row.updated_at = new Date().toISOString();
          return {data:{...row}};
        }
        return {error:new Error('시연에서 지원하지 않는 작업입니다.')};
      },
    },
  };
}
