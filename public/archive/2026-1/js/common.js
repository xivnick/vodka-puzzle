// ── Supabase config ──────────────────────────────────────────────────────────

// 퍼즐 페이지에서 방향키 입력이 보드 이동과 페이지 스크롤을 동시에 일으키지 않게 한다.
function preventPuzzleArrowScroll(event) {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  const isPuzzlePage = document.body?.classList.contains('puzzle-page') || !!document.querySelector('.board');
  if (!isPuzzlePage) return;

  const target = event.target instanceof Element ? event.target : null;
  if (target && target.closest('input, textarea, select, [contenteditable="true"]')) return;

  event.preventDefault();
}

window.addEventListener('keydown', preventPuzzleArrowScroll, { capture: true });

// iOS Safari 등에서 남는 더블탭 확대를 막는다. 서로 다른 버튼을 빠르게 누르는
// 동작은 유지하기 위해 짧은 시간 + 거의 같은 좌표인 경우만 차단한다.
let _lastTapZoomGuard = { time: 0, x: 0, y: 0 };

function isPuzzleInteractionPage() {
  return document.body?.classList.contains('puzzle-page') || !!document.querySelector('.board, .keypad, .expression-box');
}

function guardDoubleTapZoom(event) {
  if (!isPuzzleInteractionPage() || event.changedTouches.length !== 1) return;
  const touch = event.changedTouches[0];
  const now = Date.now();
  const dx = touch.clientX - _lastTapZoomGuard.x;
  const dy = touch.clientY - _lastTapZoomGuard.y;
  const isNearPreviousTap = dx * dx + dy * dy < 24 * 24;
  if (now - _lastTapZoomGuard.time < 360 && isNearPreviousTap) {
    event.preventDefault();
  }
  _lastTapZoomGuard = { time: now, x: touch.clientX, y: touch.clientY };
}

document.addEventListener('touchstart', guardDoubleTapZoom, { capture: true, passive: false });

document.addEventListener('dblclick', event => {
  if (isPuzzleInteractionPage()) event.preventDefault();
}, { capture: true });

document.addEventListener('gesturestart', event => {
  if (isPuzzleInteractionPage()) event.preventDefault();
}, { capture: true, passive: false });

// ── Supabase REST helpers ────────────────────────────────────────────────────
let archiveRowsPromise;
async function sbSelect(table, qs = '') {
  if (table !== 'completions') return [];
  archiveRowsPromise ||= fetch('/puzzle/archive/2026-1/records.json').then(r => { if (!r.ok) throw new Error('기록을 불러오지 못했습니다.'); return r.json(); });
  let rows = [...await archiveRowsPromise];
  const params = new URLSearchParams(qs);
  for (const field of ['nickname','puzzle_id']) {
    const value = params.get(field);
    if (value?.startsWith('eq.')) rows = rows.filter(row => row[field] === value.slice(3));
  }
  const order = params.get('order');
  if (order) { const [field, direction] = order.split('.'); rows.sort((a,b) => String(a[field]).localeCompare(String(b[field])) * (direction === 'desc' ? -1 : 1)); }
  const limit = params.get('limit');
  return limit ? rows.slice(0, Number(limit)) : rows;
}

async function sbInsert() { throw new Error('아카이브는 읽기 전용입니다.'); }

// ── Nickname ─────────────────────────────────────────────────────────────────
const NICK_KEY = 'vodka_nickname';

function getNickname() { return ''; }

function setNickname() {}

async function registerNickname() {}

// ── Toast ─────────────────────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg) {
  let el = document.getElementById('_toast');
  if (!el) {
    el = document.createElement('div');
    el.id = '_toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ── Header init ──────────────────────────────────────────────────────────────
const GUEST_NAME = '게스트';

function initHeader() {}

let _recentCompletionCache = null;
let _puzzleTitleMapPromise = null;
let _recentBannerTimer = null;
let _recentBannerInFlight = null;
let _recentBannerRotateTimer = null;
let _recentBannerIndex = 0;
const PUZZLE_TITLE_OVERRIDES = {
  tmp_01: '펜토미노 블리츠 1',
};

async function getLatestCompletions() {
  if (_recentCompletionCache) return _recentCompletionCache;
  try {
    const rows = await sbSelect(
      'completions',
      'select=nickname,puzzle_id,completed_at&order=completed_at.desc&limit=3'
    );
    _recentCompletionCache = rows || [];
  } catch (e) {
    _recentCompletionCache = [];
  }
  return _recentCompletionCache;
}

async function refreshLatestCompletions(force = false) {
  if (_recentBannerInFlight) return _recentBannerInFlight;
  _recentBannerInFlight = (async () => {
    if (!force && _recentCompletionCache) return _recentCompletionCache;
    try {
      const rows = await sbSelect(
        'completions',
        'select=nickname,puzzle_id,completed_at&order=completed_at.desc&limit=3'
      );
      _recentCompletionCache = rows || [];
    } catch (e) {
      if (force) _recentCompletionCache = [];
    } finally {
      _recentBannerInFlight = null;
    }
    return _recentCompletionCache;
  })();
  return _recentBannerInFlight;
}

async function getPuzzleTitleMap() {
  if (_puzzleTitleMapPromise) return _puzzleTitleMapPromise;
  _puzzleTitleMapPromise = (async () => {
    const map = new Map(Object.entries(PUZZLE_TITLE_OVERRIDES));
    try {
      const res = await fetch('/puzzle/archive/2026-1/');
      if (!res.ok) throw new Error(`index fetch failed: ${res.status}`);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('[data-puzzle-id]').forEach(el => {
        const id = el.getAttribute('data-puzzle-id');
        if (!id || map.has(id)) return;
        const titleEl = el.querySelector('.title');
        const title = titleEl ? titleEl.textContent.trim() : '';
        if (title) map.set(id, title);
      });
    } catch (e) {
      // index를 못 읽으면 override/current page title만 사용
    }
    const pageTitle = document.querySelector('h1')?.textContent?.trim();
    if (typeof PUZZLE_ID !== 'undefined' && pageTitle && !map.has(PUZZLE_ID)) {
      map.set(PUZZLE_ID, pageTitle);
    }
    return map;
  })();
  return _puzzleTitleMapPromise;
}

function buildRecentBannerText(row, puzzleTitle) {
  const nick = escHtml(row.nickname);
  const title = escHtml(puzzleTitle || row.puzzle_id);
  return `<span class="recent-banner-strong">${nick}</span>님이 ` +
    `<span class="recent-banner-strong">${title}</span>를 풀었습니다!`;
}

function applyRecentBannerMessage(banner, messageHtml) {
  banner.classList.remove('is-animated');
  banner.innerHTML = '';
  const track = document.createElement('div');
  track.className = 'recent-banner-track';
  const first = document.createElement('span');
  first.className = 'recent-banner-text';
  first.innerHTML = messageHtml;
  track.appendChild(first);
  banner.appendChild(track);

  requestAnimationFrame(() => {
    const needsAnimation = track.scrollWidth > banner.clientWidth - 8;
    if (!needsAnimation) return;
    banner.classList.add('is-animated');
    const second = first.cloneNode(true);
    track.appendChild(second);
  });
}

function stopRecentBannerRotation() {
  if (!_recentBannerRotateTimer) return;
  clearInterval(_recentBannerRotateTimer);
  _recentBannerRotateTimer = null;
}

function startRecentBannerRotation(banner, messages) {
  stopRecentBannerRotation();
  if (messages.length <= 1) return;
  _recentBannerRotateTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    _recentBannerIndex = (_recentBannerIndex + 1) % messages.length;
    applyRecentBannerMessage(banner, messages[_recentBannerIndex]);
  }, 10000);
}

async function renderRecentBanner(rows) {
  const header = document.querySelector('.site-header');
  if (!header) return;
  let banner = document.getElementById('recentBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'recentBanner';
    banner.className = 'recent-banner';
    header.insertAdjacentElement('afterend', banner);
  }

  if (!rows || rows.length === 0) {
    banner.style.display = 'none';
    stopRecentBannerRotation();
    return;
  }

  banner.style.display = 'flex';
  const titleMap = await getPuzzleTitleMap();
  const messages = rows.map(row => {
    const puzzleTitle = titleMap.get(row.puzzle_id) || row.puzzle_id;
    return buildRecentBannerText(row, puzzleTitle);
  });
  _recentBannerIndex = Math.min(_recentBannerIndex, messages.length - 1);
  applyRecentBannerMessage(banner, messages[_recentBannerIndex]);
  startRecentBannerRotation(banner, messages);
}

function initRecentBanner() {}

async function refreshRecentBanner(force = false) {
  const rows = await refreshLatestCompletions(force);
  await renderRecentBanner(rows);
}

function startRecentBannerPolling() {}

function stopRecentBannerPolling() {
  if (!_recentBannerTimer) return;
  clearInterval(_recentBannerTimer);
  _recentBannerTimer = null;
}

// ── Completion recording ─────────────────────────────────────────────────────
function _completionSavedKey(puzzleId) { return `completion_saved_${puzzleId}`; }

function isGuest() {
  const nick = getNickname();
  return !nick || nick === GUEST_NAME;
}

async function recordCompletion() { showToast('완성했습니다! 아카이브 기록에는 반영되지 않습니다.'); }

function resetCompletion() {}

// ── Cloud progress ────────────────────────────────────────────────────────────
async function sbUpsert() { throw new Error('아카이브는 읽기 전용입니다.'); }

async function saveProgressCloud() {}

async function loadProgressCloud() { return null; }

function initCloudBtns() {
  const el = document.getElementById('cloudBtns');
  if (!el) return;
  el.style.display = isGuest() ? 'none' : 'flex';
}

function toggleRules(id = 'rulesBox') {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('open');
}

function saveLocalState(key, state) {
  localStorage.setItem(key, JSON.stringify(state));
}

function loadLocalState(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

async function loadCloudState(puzzleId, applyState) {
  const state = await loadProgressCloud(puzzleId);
  if (state == null) return false;
  applyState(state);
  return true;
}

function confirmPuzzleReset(puzzleId, resetFn, message = '정말 초기화하시겠습니까?') {
  if (!confirm(message)) return false;
  resetFn();
  resetCompletion(puzzleId);
  return true;
}

// ── Leaderboard ──────────────────────────────────────────────────────────────
async function renderLeaderboard(puzzleId, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const titleEl = container.closest('.lb-section')?.querySelector('.lb-title');
  container.innerHTML = '<div class="lb-loading">불러오는 중...</div>';

  let rows;
  try {
    rows = await sbSelect(
      'completions',
      `puzzle_id=eq.${encodeURIComponent(puzzleId)}&select=nickname,completed_at&order=completed_at.asc&limit=500`
    );
  } catch (e) {
    container.innerHTML = '<div class="lb-empty">기록을 불러오지 못했습니다.</div>';
    return;
  }

  // dedup by nickname: keep earliest completed_at
  const bestMap = new Map();
  for (const row of rows) {
    if (!bestMap.has(row.nickname)) {
      bestMap.set(row.nickname, row.completed_at);
    }
  }

  const sorted = [...bestMap.entries()].sort((a, b) => new Date(a[1]) - new Date(b[1]));
  const total = sorted.length;

  if (titleEl) titleEl.textContent = `푼 사람(${total})`;

  if (total === 0) {
    container.innerHTML = '<div class="lb-empty">아직 기록이 없습니다.</div>';
    return;
  }

  const myNick = getNickname();
  const myIdx = (!myNick || isGuest()) ? -1 : sorted.findIndex(([nick]) => nick === myNick);
  const top = Math.min(10, total);

  function rowHtml(rank, nick, completedAt, extra) {
    const isMe = myNick && nick === myNick;
    return `<div class="lb-row${isMe ? ' lb-me' : ''}${extra ? ' ' + extra : ''}">` +
      `<span class="lb-rank">${rank}</span>` +
      `<span class="lb-name">${escHtml(nick)}</span>` +
      `<span class="lb-time">${fmtDatetime(completedAt)}</span>` +
      `</div>`;
  }

  function ellipsisHtml() {
    return `<div class="lb-row lb-ellipsis lb-ellipsis-toggle" role="button" tabindex="0" data-leaderboard-toggle="1">` +
      `<span class="lb-rank">⋯</span><span class="lb-name"></span><span class="lb-time"></span>` +
      `</div>`;
  }

  function render(expanded = false) {
    let html = '<div class="lb-list">';
    if (expanded || total <= 10) {
      for (let i = 0; i < total; i++) {
        html += rowHtml(i + 1, sorted[i][0], sorted[i][1]);
      }
    } else {
      for (let i = 0; i < top; i++) {
        html += rowHtml(i + 1, sorted[i][0], sorted[i][1]);
      }
      if (myIdx >= 10) {
        html += ellipsisHtml();
        html += rowHtml(myIdx + 1, sorted[myIdx][0], sorted[myIdx][1]);
        if (myIdx < total - 1) html += ellipsisHtml();
        if (myIdx < total - 1) html += rowHtml(total, sorted[total - 1][0], sorted[total - 1][1]);
      } else {
        html += ellipsisHtml();
        html += rowHtml(total, sorted[total - 1][0], sorted[total - 1][1]);
      }
    }

    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('[data-leaderboard-toggle]').forEach(toggle => {
      const toggleExpanded = () => render(true);
      toggle.addEventListener('click', toggleExpanded, { once: true });
      toggle.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        toggleExpanded();
      }, { once: true });
    });
  }

  render(container.dataset.expanded === '1');
}

// ── My completed puzzles ─────────────────────────────────────────────────────
async function getMyCompletedPuzzles() {
  const nickname = getNickname();
  if (!nickname) return new Set();
  try {
    const rows = await sbSelect(
      'completions',
      `nickname=eq.${encodeURIComponent(nickname)}&select=puzzle_id`
    );
    return new Set(rows.map(r => r.puzzle_id));
  } catch (e) {
    return new Set();
  }
}

// ── Solver rankings (for index page) ────────────────────────────────────────
async function getSolverRankings(puzzleIds = null) {
  try {
    const rows = await sbSelect('completions', 'select=nickname,puzzle_id,completed_at');
    const EXCLUDE = new Set(['puzzle_test']);
    const includeSet = Array.isArray(puzzleIds) ? new Set(puzzleIds) : null;
    const nickPuzzles = new Map(); // nickname -> Set of puzzle_ids
    const nickLastAt = new Map(); // nickname -> 가장 최근 completed_at
    for (const row of rows) {
      if (EXCLUDE.has(row.puzzle_id)) continue;
      if (includeSet && !includeSet.has(row.puzzle_id)) continue;
      if (!nickPuzzles.has(row.nickname)) {
        nickPuzzles.set(row.nickname, new Set());
        nickLastAt.set(row.nickname, row.completed_at);
      }
      nickPuzzles.get(row.nickname).add(row.puzzle_id);
      if (row.completed_at > nickLastAt.get(row.nickname)) {
        nickLastAt.set(row.nickname, row.completed_at);
      }
    }
    return [...nickPuzzles.entries()]
      .map(([nick, puzzles]) => ({ nick, count: puzzles.size, lastAt: nickLastAt.get(nick) }))
      .sort((a, b) => b.count - a.count || new Date(a.lastAt) - new Date(b.lastAt));
  } catch (e) {
    return [];
  }
}

// ── Solver counts (for index page) ──────────────────────────────────────────
async function getSolverCounts() {
  try {
    const rows = await sbSelect('completions', 'select=puzzle_id,nickname');
    const countMap = new Map();
    const seen = new Set();
    for (const row of rows) {
      const key = row.puzzle_id + '\0' + row.nickname;
      if (!seen.has(key)) {
        seen.add(key);
        countMap.set(row.puzzle_id, (countMap.get(row.puzzle_id) || 0) + 1);
      }
    }
    return countMap;
  } catch (e) {
    return new Map();
  }
}

// ── Utilities ────────────────────────────────────────────────────────────────
function fmtDatetime(isoStr) {
  const d = new Date(isoStr);
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mn = String(d.getMinutes()).padStart(2, '0');
  return `${mm}월 ${dd}일 ${hh}:${mn}`;
}

// ── 뒤로가기(bfcache) 복원 시 헤더·완료 상태 갱신 ──────────────────────────
window.addEventListener('pageshow', e => {
  if (!e.persisted) return;
  initHeader();
  initCloudBtns();
  refreshRecentBanner(true);
  // 퍼즐 페이지에 checkComplete가 있으면 호출 (게스트→닉네임 전환 후 완료 재기록)
  if (typeof checkComplete === 'function') checkComplete();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    refreshRecentBanner(true);
    startRecentBannerPolling();
    return;
  }
  stopRecentBannerPolling();
  stopRecentBannerRotation();
});

window.addEventListener('focus', () => {
  if (document.visibilityState === 'visible') refreshRecentBanner(true);
});

startRecentBannerPolling();

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
