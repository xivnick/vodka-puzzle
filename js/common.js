// ── Supabase config (placeholder) ──────────────────────────────────────────
const SUPABASE_URL = 'https://hlhrzbylbwebtoytmmpd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_YHte_s6VgQOQlU91hdsOoA_sDJ4_03y';

// ── Supabase REST helpers ───────────────────────────────────────────────────
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

// ── Nickname ────────────────────────────────────────────────────────────────
const NICK_KEY = 'vodka_nickname';

function getNickname() {
  return localStorage.getItem(NICK_KEY) || '';
}

function setNickname(name) {
  localStorage.setItem(NICK_KEY, name);
}

// ── Toast ────────────────────────────────────────────────────────────────────
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

// ── Header init ─────────────────────────────────────────────────────────────
function initHeader() {
  const input = document.getElementById('nicknameInput');
  if (!input) return;
  const saved = getNickname();
  if (saved) input.value = saved;
  function save() {
    const name = input.value.trim();
    if (!name) return;
    const prev = getNickname();
    setNickname(name);
    if (name !== prev) showToast(`닉네임이 "${escHtml(name)}"(으)로 변경되었습니다`);
  }
  let composing = false;
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !composing) { save(); input.blur(); } });
  input.addEventListener('blur', save);
}

// ── Timer ───────────────────────────────────────────────────────────────────
function _timerStartKey(puzzleId) { return `timer_start_${puzzleId}`; }
function _timerSavedKey(puzzleId) { return `timer_saved_${puzzleId}`; }

function timerStart(puzzleId) {
  const key = _timerStartKey(puzzleId);
  if (!localStorage.getItem(key)) {
    localStorage.setItem(key, Date.now().toString());
  }
}

function timerElapsed(puzzleId) {
  const start = parseInt(localStorage.getItem(_timerStartKey(puzzleId)) || '0', 10);
  if (!start) return 0;
  return Math.floor((Date.now() - start) / 1000);
}

function timerReset(puzzleId) {
  localStorage.removeItem(_timerStartKey(puzzleId));
  localStorage.removeItem(_timerSavedKey(puzzleId));
}

// ── Completion recording ────────────────────────────────────────────────────
async function recordCompletion(puzzleId) {
  const savedKey = _timerSavedKey(puzzleId);
  if (localStorage.getItem(savedKey)) return; // already recorded this session

  const nickname = getNickname();
  if (!nickname) return;

  const elapsed = timerElapsed(puzzleId);
  if (elapsed <= 0) return;

  localStorage.setItem(savedKey, '1');

  try {
    await sbInsert('completions', {
      puzzle_id: puzzleId,
      nickname: nickname,
      elapsed_seconds: elapsed,
    });
  } catch (e) {
    console.warn('recordCompletion failed:', e);
    localStorage.removeItem(savedKey); // allow retry
    return;
  }

  renderLeaderboard(puzzleId, 'leaderboard');
}

// ── Leaderboard ─────────────────────────────────────────────────────────────
async function renderLeaderboard(puzzleId, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '<div class="lb-loading">불러오는 중...</div>';

  let rows;
  try {
    rows = await sbSelect(
      'completions',
      `puzzle_id=eq.${encodeURIComponent(puzzleId)}&select=nickname,elapsed_seconds&order=elapsed_seconds.asc&limit=200`
    );
  } catch (e) {
    container.innerHTML = '<div class="lb-empty">순위를 불러오지 못했습니다.</div>';
    return;
  }

  // dedup: keep best time per nickname
  const bestMap = new Map();
  for (const row of rows) {
    const nick = row.nickname;
    if (!bestMap.has(nick) || row.elapsed_seconds < bestMap.get(nick)) {
      bestMap.set(nick, row.elapsed_seconds);
    }
  }

  const sorted = [...bestMap.entries()].sort((a, b) => a[1] - b[1]);

  if (sorted.length === 0) {
    container.innerHTML = '<div class="lb-empty">아직 기록이 없습니다.</div>';
    return;
  }

  const myNick = getNickname();
  const PAGE = 10;

  function buildList(limit) {
    const slice = sorted.slice(0, limit);
    let html = '<div class="lb-list">';
    slice.forEach(([nick, secs], i) => {
      const isMe = myNick && nick === myNick;
      html += `<div class="lb-row${isMe ? ' lb-me' : ''}">` +
        `<span class="lb-rank">${i + 1}</span>` +
        `<span class="lb-name">${escHtml(nick)}</span>` +
        `<span class="lb-time">${fmtTime(secs)}</span>` +
        `</div>`;
    });
    html += '</div>';
    if (sorted.length > limit) {
      html += `<button class="lb-more" onclick="(function(){ document.getElementById('${containerId}').querySelector('.lb-more').remove(); document.getElementById('${containerId}').querySelector('.lb-list').outerHTML; })()">더 보기</button>`;
    }
    return html;
  }

  // render initial page
  container.innerHTML = buildList(PAGE);

  // attach "더 보기" handler properly
  const moreBtn = container.querySelector('.lb-more');
  if (moreBtn) {
    moreBtn.addEventListener('click', () => {
      container.innerHTML = buildList(sorted.length);
    });
  }
}

// ── My completed puzzles ────────────────────────────────────────────────────
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

// ── Utilities ───────────────────────────────────────────────────────────────
function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
