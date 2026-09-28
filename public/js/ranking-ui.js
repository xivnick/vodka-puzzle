// Shared ranking rows and temporary display badges. Completion ownership stays in the database.
globalThis.rankingUi = (() => {
  const badges = [
    { id: 'moon', puzzleId: '260925_01', from: '2026-09-24', through: '2026-09-27', icon: '/icons/seasonal/rabbit.svg', label: '한가위 스도쿠 완성' },
    { id: 'flower', puzzleId: '260928_03', from: '2026-09-28', through: '2026-10-02', icon: '/icons/flower/flower.svg', label: '란영 스도쿠 완성' },
  ];

  function koreanDay(date = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function active(badge, date = new Date()) {
    const day = koreanDay(date);
    return day >= badge.from && day <= badge.through;
  }

  function name(nickname, solvers = {}) {
    const element = document.createElement('span');
    element.className = 'lb-name seasonal-rank-name';
    const label = document.createElement('span');
    label.textContent = nickname;
    element.append(label);
    for (const badge of badges) {
      if (!solvers[badge.id]?.has(nickname)) continue;
      const icon = document.createElement('img');
      icon.className = 'seasonal-rank-badge';
      icon.src = badge.icon;
      icon.width = 18;
      icon.height = 18;
      icon.alt = badge.label;
      icon.title = badge.label;
      element.append(icon);
    }
    return element;
  }

  function render(element, rows, { solvers = {}, showLast = false, value } = {}) {
    if (!rows?.length) {
      const empty = document.createElement('div');
      empty.className = 'lb-empty';
      empty.textContent = '아직 기록이 없습니다.';
      element.replaceChildren(empty);
      return;
    }
    const mine = rows.findIndex(row => row.isMe);
    const rowElement = row => {
      const line = document.createElement('div');
      line.className = `lb-row${row.isMe ? ' lb-me' : ''}`;
      const rank = document.createElement('span');
      rank.className = 'lb-rank';
      rank.textContent = row.rank;
      const content = value(row);
      const detail = content && typeof content === 'object' ? content : document.createElement('span');
      if (detail !== content) {
        detail.className = 'lb-time';
        detail.textContent = content ?? '';
      }
      line.append(rank, name(row.nickname, solvers), detail);
      return line;
    };
    const paint = (expanded = false) => {
      const list = document.createElement('div');
      list.className = 'lb-list';
      const visible = expanded || rows.length <= 10 ? rows.length : 10;
      for (let i = 0; i < visible; i++) list.append(rowElement(rows[i]));
      if (!expanded && rows.length > 10) {
        const ellipsis = () => {
          const line = document.createElement('div');
          line.className = 'lb-row lb-ellipsis lb-ellipsis-toggle';
          line.setAttribute('role', 'button');
          line.setAttribute('tabindex', '0');
          line.setAttribute('aria-label', '전체 랭킹 펼치기');
          const mark = document.createElement('span');
          mark.className = 'lb-rank';
          mark.textContent = '⋯';
          const middle = document.createElement('span');
          middle.className = 'lb-name';
          const end = document.createElement('span');
          end.className = 'lb-time';
          line.append(mark, middle, end);
          const expand = () => paint(true);
          line.addEventListener('click', expand, { once: true });
          line.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            expand();
          }, { once: true });
          return line;
        };
        list.append(ellipsis());
        if (mine >= 10) {
          list.append(rowElement(rows[mine]));
          if (mine < rows.length - 1) list.append(ellipsis());
        }
        if (showLast && mine !== rows.length - 1) list.append(rowElement(rows.at(-1)));
      }
      element.replaceChildren(list);
    };
    paint(element.dataset?.expanded === '1');
  }

  return { badges, active, name, render };
})();
