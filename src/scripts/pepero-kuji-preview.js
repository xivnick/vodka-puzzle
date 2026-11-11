const root = document.querySelector('#kujiPreview');
if (root) {
  const $ = id => document.getElementById(id);
  const key = 'pepero-kuji-preview-v1';
  const prizes = [
    { grade: 'A', name: '빼빼로 선물 박스', description: '여러 가지 맛을 한 번에, 달콤한 한 상자', total: 1 },
    { grade: 'B', name: '빼빼로 3종 세트', description: '골라 먹는 즐거움이 있는 세 가지 맛', total: 3 },
    { grade: 'C', name: '빼빼로 한 갑', description: '퍼즐 뒤에 즐기는 작은 달콤함', total: 8 },
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
    $('playerName').textContent = name;
    $('eligibility').textContent = own ? '이미 뽑기에 참여하셨습니다.' : eligible ? '빼빼로 스도쿠 완료 · 뽑기 1회 가능' : '빼빼로 스도쿠를 완료하면 참여할 수 있어요.';
    $('ticketStatus').textContent = own ? '참여 완료' : eligible ? '1장' : '잠김';
    $('remainingCount').textContent = `남은 번호표 ${12 - draws.length} / 12`;
    $('drawHint').textContent = own ? '받으신 상품과 다른 분들의 당첨 결과를 확인해 보세요.' : eligible ? '마음에 드는 번호표를 한 장 골라 주세요.' : '스도쿠를 푼 뒤 나만의 번호표를 골라 주세요.';
    $('myPrize').hidden = !own;
    if (own) $('myPrize').innerHTML = `<span>나의 당첨 상품 · No. ${String(own.ticket).padStart(2, '0')}</span>${own.grade}상 · ${prizeFor(own.grade).name}`;
    $('ticketGrid').replaceChildren(...Array.from({ length: 12 }, (_, i) => {
      const ticket = i + 1;
      const drawn = draws.find(d => d.ticket === ticket);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `kuji-ticket${drawn ? ' used' : ''}`;
      button.disabled = busy || !!drawn || !!own || !eligible;
      button.setAttribute('aria-label', `${ticket}번 번호표${drawn ? `, ${drawn.person}님 ${drawn.grade}상 당첨` : ', 뽑기'}`);
      button.innerHTML = `<span class="ticket-brand">PEPERO KUJI</span><span class="ticket-number">${String(ticket).padStart(2, '0')}</span><span class="ticket-tail">${drawn ? `${drawn.grade}상 · ${drawn.person}` : 'GOOD LUCK'}</span>`;
      button.addEventListener('click', () => draw(ticket, button));
      return button;
    }));
    $('prizeList').innerHTML = prizes.map(p => `<article class="prize-row"><span class="grade-badge" data-grade="${p.grade}">${p.grade}</span><div class="prize-info"><h3>${p.name}</h3><p>${p.description}</p></div><div class="prize-stock">${remaining(p)}개 남음<small>총 ${p.total}개</small></div></article>`).join('');
    $('winnerCount').textContent = `${draws.length}명 참여`;
    $('winnerList').innerHTML = [...draws].reverse().map(d => `<li${d.person === name ? ' class="is-me"' : ''}><span class="winner-ticket">${String(d.ticket).padStart(2, '0')}</span><span>${d.person}${d.person === name ? ' (나)' : ''}</span><span class="winner-prize">${d.grade}상 · ${prizeFor(d.grade).name}</span></li>`).join('');
  }
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function draw(ticket, button) {
    if (busy || player() !== '퍼즐러' || draws.some(d => d.person === player() || d.ticket === ticket)) return;
    busy = true;
    const pool = prizes.flatMap(p => Array(remaining(p)).fill(p));
    const prize = pool[Math.floor(Math.random() * pool.length)];
    // Commit before the animation so refreshing cannot grant another draw.
    draws.push({ ticket, grade: prize.grade, person: player() });
    save();
    $('demoPlayer').disabled = true;
    $('resetDemo').disabled = true;
    root.querySelectorAll('.kuji-ticket').forEach(b => { b.disabled = true; });
    button.classList.add('chosen');
    $('drawStatus').textContent = `${ticket}번 번호표에 어떤 상품이 숨어 있을까요…`;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    await pause(reduced ? 150 : 1600);
    button.classList.remove('chosen');
    button.classList.add('opening');
    $('drawStatus').textContent = '행운의 번호표를 열고 있어요…';
    await pause(reduced ? 100 : 600);
    $('resultGrade').textContent = `${prize.grade}상`;
    $('resultTitle').textContent = prize.name;
    $('resultDescription').textContent = `${player()}님, 축하드립니다! ${ticket}번 번호표의 주인공이 되셨어요.`;
    $('confetti').innerHTML = Array.from({ length: 34 }, (_, i) => `<i style="--left:${Math.random() * 100}%;--color:${['#c89e58', '#b97965', '#e4ca91', '#8c9b7b'][i % 4]};--duration:${1.8 + Math.random()}s;--delay:${Math.random() * .7}s"></i>`).join('');
    busy = false;
    $('demoPlayer').disabled = false;
    $('resetDemo').disabled = false;
    render();
    $('drawStatus').textContent = '뽑기가 완료되었습니다. 당첨 결과가 기록되었어요.';
    $('prizeDialog').showModal();
  }
  $('closeResult').addEventListener('click', () => $('prizeDialog').close());
  $('prizeDialog').addEventListener('close', () => $('demoPlayer').focus({ preventScroll: true }));
  $('demoPlayer').addEventListener('change', () => { $('drawStatus').textContent = ''; render(); });
  $('resetDemo').addEventListener('click', () => {
    if (busy) return;
    draws = seed(); save(); $('demoPlayer').value = 'ready'; $('drawStatus').textContent = '예시를 처음 상태로 되돌렸습니다.'; render();
  });
  render();
}
