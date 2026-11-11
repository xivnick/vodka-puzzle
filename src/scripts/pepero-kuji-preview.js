import {couponFrame} from '../lib/kuji-ticket-frame.js';
const root = document.querySelector('#kujiPreview');
if (root) {
  const $ = id => document.getElementById(id);
  const key = 'pepero-kuji-preview-v2';
  const prizes = [
    { id: 'chocofilled-choco', grade: 'A', name: '초코필드+초코', total: 1 },
    { id: 'white-choco', grade: 'A', name: '화이트+초코', total: 1 },
    { id: 'choco', grade: 'B', name: '빼빼로초코', total: 2 },
    { id: 'almond', grade: 'B', name: '빼빼로아몬드', total: 2 },
    { id: 'chocofilled', grade: 'B', name: '빼빼로초코필드', total: 2 },
    { id: 'white', grade: 'B', name: '빼빼로화이트', total: 2 },
    { id: 'crunky', grade: 'B', name: '빼빼로크런키', total: 2 },
  ];
  const totalPrizes = prizes.reduce((total, prize) => total + prize.total, 0);
  const seed = () => [
    { ticket: 2, prizeId: 'choco', person: '별사탕' },
    { ticket: 7, prizeId: 'almond', person: '모카' },
    { ticket: 10, prizeId: 'choco', person: '네모' },
  ];
  let draws = seed();
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    // Only restore the one demo draw in addition to the fixed sample winners.
    if (Array.isArray(stored) && stored.length === 4) {
      const last = stored[3];
      if (last.person === '퍼즐러' && Number.isInteger(last.ticket) && last.ticket >= 1 && last.ticket <= totalPrizes && !seed().some(d => d.ticket === last.ticket) && prizes.some(p => p.id === last.prizeId && p.total > seed().filter(d => d.prizeId === p.id).length)) draws.push(last);
    }
  } catch { /* Storage is optional for this preview. */ }
  let busy = false;
  const player = () => ({ ready: '퍼즐러', locked: '초코', drawn: '모카' })[$('demoPlayer').value];
  const prizeFor = id => prizes.find(p => p.id === id);
  const remaining = prize => prize.total - draws.filter(d => d.prizeId === prize.id).length;
  const save = () => { try { localStorage.setItem(key, JSON.stringify(draws)); } catch { /* Keep the current page usable. */ } };

  const couponMarkup = (ticket, drawn) => couponFrame + (drawn
    ? `<span class="coupon-prize">${prizeFor(drawn.prizeId).name}</span><span class="coupon-label">${drawn.person}</span>`
    : `<span class="coupon-number">${String(ticket).padStart(2, '0')}</span>`);
  function render() {
    const name = player();
    const own = draws.find(d => d.person === name);
    const eligible = $('demoPlayer').value !== 'locked';
    $('couponGrid').replaceChildren(...Array.from({ length: totalPrizes }, (_, i) => {
      const ticket = i + 1;
      const drawn = draws.find(d => d.ticket === ticket);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `coupon${drawn ? ' is-used' : ''}`;
      button.disabled = busy || !!own || !eligible || !!drawn;
      button.setAttribute('aria-label', `${ticket}번 쿠폰${drawn ? `, ${drawn.person}님 추첨 완료` : ', 뽑기'}`);
      button.innerHTML = couponMarkup(ticket, drawn);
      button.addEventListener('click', () => draw(ticket, button));
      return button;
    }));
    const balance = eligible && !own ? 1 : 0;
    $('ticketBalance').textContent = String(balance);
    $('ticketWallet').setAttribute('aria-label', `내 남은 티켓 ${balance}장`);
    $('drawResult').hidden = !own || busy;
    if (own && !busy) {
      $('resultItem').className = 'result-item';
      $('resultItem').innerHTML = `<span class="result-grade">${prizeFor(own.prizeId).grade}상</span><div><strong>${prizeFor(own.prizeId).name}</strong><small>${name}</small></div>`;
    }
    $('prizeList').innerHTML = prizes.map(p => `<article class="prize-row"><span class="prize-grade">${p.grade}상</span><h3>${p.name}</h3><span class="prize-stock">${remaining(p)} / ${p.total}</span></article>`).join('');
  }
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function draw(ticket, button) {
    if (busy || player() !== '퍼즐러' || draws.some(d => d.person === player() || d.ticket === ticket)) return;
    busy = true;
    const pool = prizes.flatMap(p => Array(remaining(p)).fill(p));
    const prize = pool[Math.floor(Math.random() * pool.length)];
    // Commit before the animation so refreshing cannot grant another draw.
    draws.push({ ticket, prizeId: prize.id, person: player() });
    save();
    $('ticketBalance').textContent = '0';
    $('ticketWallet').setAttribute('aria-label', '내 남은 티켓 0장');
    $('demoPlayer').disabled = true;
    $('resetDemo').disabled = true;
    root.querySelectorAll('.coupon').forEach(coupon => { coupon.disabled = true; });
    button.classList.add('is-selected');
    button.setAttribute('aria-busy', 'true');
    button.setAttribute('aria-label', `${ticket}번 쿠폰 확인 중`);
    // Keep the result area out of the layout until the ticket has fully opened.
    $('drawResult').hidden = true;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    await pause(reduced ? 0 : 700);
    button.classList.remove('is-selected');
    button.classList.add('is-opening');
    await pause(reduced ? 0 : 220);
    button.innerHTML = couponMarkup(ticket, draws.find(d => d.ticket === ticket));
    button.classList.add('is-used');
    button.setAttribute('aria-label', `${ticket}번 쿠폰, ${prize.name}, ${player()}님`);
    await pause(reduced ? 0 : 300);
    busy = false;
    $('demoPlayer').disabled = false;
    $('resetDemo').disabled = false;
    render();
    $('resultItem').classList.add('is-revealed');
  }
  $('demoPlayer').addEventListener('change', render);
  $('resetDemo').addEventListener('click', () => {
    if (busy) return;
    draws = seed(); save(); $('demoPlayer').value = 'ready'; render();
  });
  render();
}
