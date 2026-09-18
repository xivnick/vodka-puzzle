// Choose once per page load, before either ranking finishes loading.
{
  const mode = Math.random() < 0.5 ? 'regular' : 'daily';
  document.querySelectorAll('[data-rank-mode]').forEach(button => {
    const active = button.dataset.rankMode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.getElementById('regularRankPanel').hidden = mode !== 'regular';
  document.getElementById('dailyRankPanel').hidden = mode !== 'daily';
  document.getElementById('rankTitle').textContent = mode === 'daily' ? '데일리 스도쿠' : '랭킹';
}

const PAGE_SIZE = 10;
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
    const visibleLinks = links;
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

  async function loadCompletions() {
    const completed = await getMyCompletedPuzzles();
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
  }

  loadCounts();

  async function loadSolverRankings() {
    const scopeIds = [...document.querySelectorAll('.list a[data-puzzle-id]')]
      .map(a => a.dataset.puzzleId);

    const rankings = await getSolverRankings(scopeIds);
    const myNick = getNickname();
    const container = document.getElementById('solverRank');
    const rankTitle = document.getElementById('rankTitle');
    rankTitle.dataset.regularCount = String(rankings.length);
    if (document.getElementById('regularRankBtn').getAttribute('aria-pressed') === 'true') rankTitle.textContent = `랭킹 (${rankings.length})`;

    if (rankings.length === 0) {
      container.innerHTML = '<div class="lb-empty">아직 기록이 없습니다.</div>';
      return;
    }


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
    document.querySelectorAll('.list a[data-puzzle-id] .check-mark').forEach(el => el.remove());
    renderPagination();
    loadCompletions();
    loadSolverRankings();
  });

  window.addEventListener('hashchange', renderPagination);

window.addEventListener('puzzle-auth-ready', () => {
  document.querySelectorAll('.list a[data-puzzle-id] .check-mark').forEach(el => el.remove());
  loadCompletions();
  loadSolverRankings();
});
