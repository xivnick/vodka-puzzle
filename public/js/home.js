const PAGE_SIZE = 10;
  let completedPuzzles = new Set();
  let solverCounts = new Map();
  let showUnsolvedOnly = false;
  let sortBySolverCount = false;


  function getCurrentPage(totalPages) {
    const hash = window.location.hash.match(/^#page-(\d+)$/);
    const page = hash ? parseInt(hash[1], 10) : 1;
    return Math.min(Math.max(page, 1), totalPages);
  }

  function setCurrentPage(page) {
    if (page <= 1) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    } else {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}#page-${page}`);
    }
  }

  function renderPagination() {
    const links = [...document.querySelectorAll('.list a[data-puzzle-id]')];
    const originalIndex = new Map(links.map((link, index) => [link, index]));
    let visibleLinks = showUnsolvedOnly
      ? links.filter(link => !completedPuzzles.has(link.dataset.puzzleId))
      : [...links];

    if (sortBySolverCount) {
      visibleLinks = visibleLinks.sort((a, b) => {
        const byCount = (solverCounts.get(b.dataset.puzzleId) || 0) - (solverCounts.get(a.dataset.puzzleId) || 0);
        return byCount || originalIndex.get(a) - originalIndex.get(b);
      });
    }
    const totalPages = Math.max(1, Math.ceil(visibleLinks.length / PAGE_SIZE));
    const currentPage = getCurrentPage(totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;

    links.forEach(link => {
      link.style.display = 'none';
      link.style.order = '';
      link.classList.remove('first-visible');
    });
    visibleLinks.forEach((link, index) => {
      link.style.display = index >= start && index < end ? '' : 'none';
      link.style.order = index;
    });
    if (visibleLinks[start]) visibleLinks[start].classList.add('first-visible');

    const pager = document.getElementById('pager');
    pager.innerHTML = '';
    if (totalPages <= 1) return;

    const prev = document.createElement('button');
    prev.textContent = '‹';
    prev.disabled = currentPage === 1;
    prev.addEventListener('click', () => {
      if (currentPage === 1) return;
      setCurrentPage(currentPage - 1);
      renderPagination();
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    pager.appendChild(prev);

    for (let page = 1; page <= totalPages; page += 1) {
      const btn = document.createElement('button');
      btn.textContent = page;
      btn.className = page === currentPage ? 'active' : '';
      btn.addEventListener('click', () => {
        setCurrentPage(page);
        renderPagination();
        window.scrollTo({ top: 0, behavior: 'instant' });
      });
      pager.appendChild(btn);
    }

    const next = document.createElement('button');
    next.textContent = '›';
    next.disabled = currentPage === totalPages;
    next.addEventListener('click', () => {
      if (currentPage === totalPages) return;
      setCurrentPage(currentPage + 1);
      renderPagination();
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    pager.appendChild(next);
  }

  renderPagination();

  function initUnsolvedFilter() {
    const unsolvedBtn = document.getElementById('unsolvedFilterBtn');
    if (!unsolvedBtn) return;
    if (isGuest()) {
      showUnsolvedOnly = false;
      unsolvedBtn.style.display = 'none';
      updateListModeButtons();
      return;
    }
    unsolvedBtn.style.display = '';
  }

  function updateListModeButtons() {
    document.getElementById('unsolvedFilterBtn').classList.toggle('active', showUnsolvedOnly);
    document.getElementById('solverSortBtn').classList.toggle('active', sortBySolverCount);
  }

  function toggleUnsolvedOnly() {
    if (isGuest()) return;
    showUnsolvedOnly = !showUnsolvedOnly;
    updateListModeButtons();
    setCurrentPage(1);
    renderPagination();
  }

  function toggleSolverSort() {
    sortBySolverCount = !sortBySolverCount;
    updateListModeButtons();
    setCurrentPage(1);
    renderPagination();
  }

  initUnsolvedFilter();

  async function loadCompletions() {
    const completed = await getMyCompletedPuzzles();
    completedPuzzles = completed;
    document.querySelectorAll('.list a[data-puzzle-id]').forEach(a => {
      const pid = a.dataset.puzzleId;
      if (completed.has(pid)) {
        if (!a.querySelector('.check-mark')) {
          const ck = document.createElement('span');
          ck.className = 'check-mark';
          ck.textContent = '✓';
          a.querySelector('.title').appendChild(ck);
        }
      }
    });
    renderPagination();
  }

  loadCompletions();

  async function loadCounts() {
    const counts = await getSolverCounts();
    solverCounts = counts;
    document.querySelectorAll('.list a[data-puzzle-id]').forEach(a => {
      const pid = a.dataset.puzzleId;
      const n = counts.get(pid);
      if (n) {
        const titleSpan = a.querySelector('.title');
        if (!titleSpan.querySelector('.solver-count')) {
          const ct = document.createElement('span');
          ct.className = 'solver-count';
          ct.textContent = `(${n})`;
          titleSpan.insertBefore(ct, titleSpan.querySelector('.check-mark'));
        }
      }
    });
    if (sortBySolverCount) renderPagination();
  }

  loadCounts();

  let rankMode = 'recent';

  function getRecentPuzzleIds(limit = 10) {
    return [...document.querySelectorAll('.list a[data-puzzle-id]')]
      .map(a => a.dataset.puzzleId)
      .filter(id => id && id !== 'puzzle_test')
      .slice(0, limit);
  }

  function setRankMode(nextMode) {
    rankMode = nextMode === 'all' ? 'all' : 'recent';
    document.getElementById('recentRankBtn').classList.toggle('active', rankMode === 'recent');
    document.getElementById('allRankBtn').classList.toggle('active', rankMode === 'all');
    loadSolverRankings();
  }

  async function loadSolverRankings() {
    const scopeIds = getRecentPuzzleIds(rankMode === 'recent' ? 10 : Infinity);
    const rankings = await getSolverRankings(scopeIds);
    const myNick = getNickname();
    const container = document.getElementById('solverRank');
    const titleEl = document.getElementById('rankTitle');
    const titlePrefix = rankMode === 'recent' ? '최신 문제 랭킹' : '전체 랭킹';

    if (rankings.length === 0) {
      titleEl.textContent = `${titlePrefix} (0)`;
      container.innerHTML = '<div class="lb-empty">아직 기록이 없습니다.</div>';
      return;
    }

    titleEl.textContent = `${titlePrefix} (${rankings.length})`;

    const myIdx = (!myNick || isGuest()) ? -1 : rankings.findIndex(r => r.nick === myNick);
    const top = Math.min(10, rankings.length);

    function rowHtml(rank, nick, count, extra) {
      const isMe = myNick && nick === myNick;
      return `<div class="lb-row${isMe ? ' lb-me' : ''}${extra ? ' ' + extra : ''}">` +
        `<span class="lb-rank">${rank}</span>` +
        `<span class="lb-name">${escHtml(nick)}</span>` +
        `<span class="lb-time">${count}개</span>` +
        `</div>`;
    }

    function ellipsisRow() {
      return `<div class="lb-row lb-ellipsis lb-ellipsis-toggle" data-expand-rankings="1">` +
        `<span class="lb-rank">⋯</span><span class="lb-name"></span><span class="lb-time"></span>` +
        `</div>`;
    }

    function render(expanded = false) {
      let html = '<div class="lb-list">';
      if (expanded || rankings.length <= 10) {
        for (let i = 0; i < rankings.length; i++) {
          html += rowHtml(i + 1, rankings[i].nick, rankings[i].count);
        }
      } else {
        for (let i = 0; i < top; i++) {
          html += rowHtml(i + 1, rankings[i].nick, rankings[i].count);
        }
        if (myIdx >= 10) {
          html += ellipsisRow();
          html += rowHtml(myIdx + 1, rankings[myIdx].nick, rankings[myIdx].count);
          if (myIdx < rankings.length - 1) html += ellipsisRow();
        } else if (rankings.length > 10) {
          html += ellipsisRow();
        }
      }
      html += '</div>';
      container.innerHTML = html;
      container.querySelectorAll('[data-expand-rankings]').forEach(el => {
        el.addEventListener('click', () => render(true), { once: true });
      });
    }

    render(false);
  }

  loadSolverRankings();

  window.addEventListener('pageshow', e => {
    if (!e.persisted) return;
    document.querySelectorAll('.check-mark').forEach(el => el.remove());
    initUnsolvedFilter();
    renderPagination();
    loadCompletions();
    loadSolverRankings();
  });

  window.addEventListener('hashchange', renderPagination);

window.addEventListener('puzzle-auth-ready', () => {
  document.querySelectorAll('.check-mark').forEach(el => el.remove());
  initUnsolvedFilter();
  loadCompletions();
  loadSolverRankings();
});
