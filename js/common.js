// ── Supabase config ──────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://hlhrzbylbwebtoytmmpd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_YHte_s6VgQOQlU91hdsOoA_sDJ4_03y';

// ── Supabase REST helpers ────────────────────────────────────────────────────
async function sbSelect(table, qs) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${qs ? '?' + qs : ''}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`sbSelect ${table}: ${res.status}`);
  return res.json();
}

async function sbInsert(table, data) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`sbInsert ${table}: ${res.status}`);
  return true;
}

// ── Nickname ─────────────────────────────────────────────────────────────────
const NICK_KEY = 'vodka_nickname';

function getNickname() {
  return localStorage.getItem(NICK_KEY) || '';
}

function setNickname(name) {
  localStorage.setItem(NICK_KEY, name);
}

async function registerNickname(name) {
  if (!name || name === GUEST_NAME) return;
  try {
    const url = `${SUPABASE_URL}/rest/v1/nicknames`;
    await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify({ nickname: name }),
    });
  } catch (e) {
    // 등록 실패해도 닉네임 설정 자체는 유지
  }
}

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

function initHeader() {
  const link = document.getElementById('nicknameLink');
  if (!link) return;
  const saved = getNickname();
  link.textContent = saved || GUEST_NAME;
}

// ── Completion recording ─────────────────────────────────────────────────────
function _completionSavedKey(puzzleId) { return `completion_saved_${puzzleId}`; }

function isGuest() {
  const nick = getNickname();
  return !nick || nick === GUEST_NAME;
}

async function recordCompletion(puzzleId) {
  const savedKey = _completionSavedKey(puzzleId);

  // 게스트로 완료했다가 닉네임을 설정한 경우 → 플래그 초기화 후 재기록
  if (localStorage.getItem(savedKey) === 'guest' && !isGuest()) {
    localStorage.removeItem(savedKey);
  }

  if (localStorage.getItem(savedKey)) return; // already recorded

  if (isGuest()) {
    // 게스트는 저장 안 함 → 닉네임 설정 유도
    localStorage.setItem(savedKey, 'guest'); // 세션 내 중복 알림 방지
    setTimeout(() => {
      if (confirm('닉네임을 설정하면 이 기록이 저장됩니다.\n닉네임 설정 페이지로 이동할까요?')) {
        location.href = '/puzzle/nickname/';
      }
    }, 300);
    return;
  }

  const nickname = getNickname();
  localStorage.setItem(savedKey, '1');

  try {
    const url = `${SUPABASE_URL}/rest/v1/completions?on_conflict=nickname,puzzle_id`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify({ puzzle_id: puzzleId, nickname: nickname }),
    });
    if (!res.ok) throw new Error(`recordCompletion: ${res.status}`);
  } catch (e) {
    console.warn('recordCompletion failed:', e);
    localStorage.removeItem(savedKey); // allow retry
    return;
  }

  showToast('🎉 완성했습니다!');
  renderLeaderboard(puzzleId, 'leaderboard');
}

function resetCompletion(puzzleId) {
  localStorage.removeItem(_completionSavedKey(puzzleId));
}

// ── Cloud progress ────────────────────────────────────────────────────────────
async function sbUpsert(table, data, onConflict) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`sbUpsert ${table}: ${res.status}`);
  return true;
}

async function saveProgressCloud(puzzleId, state) {
  if (isGuest()) { showToast('닉네임을 설정해야 저장할 수 있습니다.'); return; }
  try {
    await sbUpsert('progress', {
      nickname: getNickname(),
      puzzle_id: puzzleId,
      state: state,
      saved_at: new Date().toISOString(),
    }, 'nickname,puzzle_id');
    showToast('저장했습니다.');
  } catch(e) {
    console.warn('saveProgressCloud failed:', e);
    showToast('저장에 실패했습니다.');
  }
}

async function loadProgressCloud(puzzleId) {
  if (isGuest()) { showToast('닉네임을 설정해야 불러올 수 있습니다.'); return null; }
  try {
    const rows = await sbSelect(
      'progress',
      `nickname=eq.${encodeURIComponent(getNickname())}&puzzle_id=eq.${encodeURIComponent(puzzleId)}&select=state&limit=1`
    );
    if (rows.length === 0) { showToast('불러올 데이터가 없습니다.'); return null; }
    showToast('불러왔습니다.');
    return rows[0].state;
  } catch(e) {
    console.warn('loadProgressCloud failed:', e);
    showToast('불러오기에 실패했습니다.');
    return null;
  }
}

function initCloudBtns() {
  const el = document.getElementById('cloudBtns');
  if (!el) return;
  el.style.display = isGuest() ? 'none' : 'flex';
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

  function rowHtml(rank, nick, completedAt, extra) {
    const isMe = myNick && nick === myNick;
    return `<div class="lb-row${isMe ? ' lb-me' : ''}${extra ? ' ' + extra : ''}">` +
      `<span class="lb-rank">${rank}</span>` +
      `<span class="lb-name">${escHtml(nick)}</span>` +
      `<span class="lb-time">${fmtDatetime(completedAt)}</span>` +
      `</div>`;
  }

  let html = '<div class="lb-list">';
  const top = Math.min(10, total);
  for (let i = 0; i < top; i++) {
    html += rowHtml(i + 1, sorted[i][0], sorted[i][1]);
  }
  if (total > 10) {
    html += `<div class="lb-row lb-ellipsis">` +
      `<span class="lb-rank">⋯</span><span class="lb-name"></span><span class="lb-time"></span>` +
      `</div>`;
    const last = sorted[total - 1];
    html += rowHtml(total, last[0], last[1]);
  }
  html += '</div>';
  container.innerHTML = html;
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
async function getSolverRankings() {
  try {
    const rows = await sbSelect('completions', 'select=nickname,puzzle_id');
    const EXCLUDE = new Set(['puzzle_test']);
    const nickPuzzles = new Map();
    for (const row of rows) {
      if (EXCLUDE.has(row.puzzle_id)) continue;
      if (!nickPuzzles.has(row.nickname)) nickPuzzles.set(row.nickname, new Set());
      nickPuzzles.get(row.nickname).add(row.puzzle_id);
    }
    return [...nickPuzzles.entries()]
      .map(([nick, puzzles]) => ({ nick, count: puzzles.size }))
      .sort((a, b) => b.count - a.count || a.nick.localeCompare(b.nick));
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
  // 퍼즐 페이지에 checkComplete가 있으면 호출 (게스트→닉네임 전환 후 완료 재기록)
  if (typeof checkComplete === 'function') checkComplete();
});

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
