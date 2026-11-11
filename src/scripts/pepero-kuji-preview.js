const root = document.querySelector('#kujiPreview');
if (root) {
  const $ = id => document.getElementById(id);
  const key = 'pepero-kuji-preview-v1';
  const prizes = [
    { grade: 'A', name: '빼빼로 선물 박스', total: 1 },
    { grade: 'B', name: '빼빼로 3종 세트', total: 3 },
    { grade: 'C', name: '빼빼로 한 갑', total: 8 },
  ];
  const seed = () => [
    { ticket: 2, grade: 'C', person: '별사탕' },
    { ticket: 7, grade: 'B', person: '모카' },
    { ticket: 10, grade: 'C', person: '네모' },
  ];
  let draws = seed();
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    // Only restore the one demo draw in addition to the fixed sample winners.
    if (Array.isArray(stored) && stored.length === 4) {
      const last = stored[3];
      if (last.person === '퍼즐러' && Number.isInteger(last.ticket) && last.ticket >= 1 && last.ticket <= 12 && !seed().some(d => d.ticket === last.ticket) && prizes.some(p => p.grade === last.grade)) draws.push(last);
    }
  } catch { /* Storage is optional for this preview. */ }
  let busy = false;
  const player = () => ({ ready: '퍼즐러', locked: '초코', drawn: '모카' })[$('demoPlayer').value];
  const prizeFor = grade => prizes.find(p => p.grade === grade);
  const remaining = prize => prize.total - draws.filter(d => d.grade === prize.grade).length;
  const save = () => { try { localStorage.setItem(key, JSON.stringify(draws)); } catch { /* Keep the current page usable. */ } };
  function render() {
    const name = player();
    const own = draws.find(d => d.person === name);
    const eligible = $('demoPlayer').value !== 'locked';
    $('eligibility').textContent = own ? `${name} · 참여 완료` : eligible ? `${name} · 스도쿠 완료 · 뽑기 1회 가능` : `${name} · 빼빼로 스도쿠를 완료하면 참여할 수 있습니다.`;
    $('drawButton').disabled = busy || !!own || !eligible;
    $('drawButton').textContent = busy ? '뽑는 중…' : own ? '참여 완료' : '1회 뽑기';
    $('remainingCount').textContent = `남은 상품 ${12 - draws.length}개`;
    $('drawResult').hidden = !own && !busy;
    if (own && !busy) {
      $('drawStatus').textContent = '당첨 결과가 기록되었습니다.';
      $('resultItem').className = 'result-item';
      $('resultItem').innerHTML = `<span class="result-grade">${own.grade}상</span><div><strong>${prizeFor(own.grade).name}</strong><small>${name}</small></div>`;
    }
    $('prizeList').innerHTML = prizes.map(p => `<article class="prize-row"><span class="prize-grade">${p.grade}상</span><h3>${p.name}</h3><span class="prize-stock">${remaining(p)} / ${p.total}</span></article>`).join('');
    $('winnerCount').textContent = `${draws.length}명`;
    $('winnerList').innerHTML = [...draws].reverse().map(d => `<li><span>${d.person}${d.person === name ? ' (나)' : ''}</span><span class="winner-prize">${d.grade}상 · ${prizeFor(d.grade).name}</span></li>`).join('');
  }
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function draw() {
    const tickets = Array.from({ length: 12 }, (_, i) => i + 1).filter(n => !draws.some(d => d.ticket === n));
    const ticket = tickets[Math.floor(Math.random() * tickets.length)];
    if (busy || player() !== '퍼즐러' || draws.some(d => d.person === player() || d.ticket === ticket)) return;
    busy = true;
    const pool = prizes.flatMap(p => Array(remaining(p)).fill(p));
    const prize = pool[Math.floor(Math.random() * pool.length)];
    // Commit before the animation so refreshing cannot grant another draw.
    draws.push({ ticket, grade: prize.grade, person: player() });
    save();
    $('demoPlayer').disabled = true;
    $('resetDemo').disabled = true;
    $('drawButton').disabled = true;
    $('drawButton').textContent = '뽑는 중…';
    $('drawResult').hidden = false;
    $('drawResult').setAttribute('aria-busy', 'true');
    $('drawStatus').textContent = '열어보는 중…';
    $('resultItem').className = 'result-item is-sealed';
    $('resultItem').innerHTML = '<span class="result-cover" aria-hidden="true">?</span>';
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    await pause(reduced ? 0 : 800);
    busy = false;
    $('demoPlayer').disabled = false;
    $('resetDemo').disabled = false;
    render();
    $('drawResult').setAttribute('aria-busy', 'false');
    $('resultItem').classList.add('is-revealed');
  }
  $('drawButton').addEventListener('click', draw);
  $('demoPlayer').addEventListener('change', () => { $('drawStatus').textContent = ''; render(); });
  $('resetDemo').addEventListener('click', () => {
    if (busy) return;
    draws = seed(); save(); $('demoPlayer').value = 'ready'; $('drawStatus').textContent = '예시를 처음 상태로 되돌렸습니다.'; render();
  });
  render();
}
