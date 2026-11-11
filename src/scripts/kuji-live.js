import {applyKujiContext} from './kuji-account.js';
import {couponFrame} from '../lib/kuji-ticket-frame.js';

export async function initializeKuji(root) {
  const $ = id => document.getElementById(id);
  const eventId = root.dataset.event;
  let context, busy = false, reading = false, revision = 0, pending = null;
  await window.puzzleAuthReady;
  const account = window.puzzleAccount;
  const owner = account.user?.id ?? null;
  const pendingKey = `kuji-pending:${eventId}:${owner}`;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const messages = {
    LOGIN_REQUIRED: '로그인해 주세요.', PROFILE_REQUIRED: '닉네임을 먼저 설정해 주세요.',
    COMPLETION_REQUIRED: '이번 쿠지의 참여 대상이 아닙니다.', NO_TICKETS: '남은 티켓이 없습니다.',
    TICKET_UNAVAILABLE: '이미 선택된 쿠폰입니다. 다른 쿠폰을 골라 주세요.', UNAVAILABLE: '현재 참여할 수 없는 쿠지입니다.',
  };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const claimed = ticket => Boolean(ticket.claimed_at);
  function couponMarkup(ticket) {
    return couponFrame + (claimed(ticket)
      ? `<span class="coupon-prize">${escape(ticket.prize_name)}</span><span class="coupon-label">${escape(ticket.nickname)}</span>`
      : `<span class="coupon-number">${String(ticket.number).padStart(2, '0')}</span>`);
  }
  function message(text = '', retry = false) {
    $('kujiMessage').textContent = text;
    $('kujiMessage').hidden = !text;
    $('kujiRetry').hidden = !retry;
  }
  function savePending(number) {
    pending = number;
    try {
      if (number === null) sessionStorage.removeItem(pendingKey);
      else sessionStorage.setItem(pendingKey, String(number));
    } catch { /* A running request remains protected by its coupon number. */ }
  }
  try {
    const stored = Number(sessionStorage.getItem(pendingKey));
    if (owner && Number.isInteger(stored) && stored > 0) pending = stored;
  } catch { /* Storage is optional. */ }
  async function rpc(name, args) {
    if (owner !== (window.puzzleAccount.user?.id ?? null)) throw new Error('ACCOUNT_CHANGED');
    const {data, error} = await account.client.rpc(name, args).abortSignal(AbortSignal.timeout(15000));
    if (owner !== (window.puzzleAccount.user?.id ?? null)) throw new Error('ACCOUNT_CHANGED');
    if (error) throw error;
    return data;
  }
  function render(animateNumber = null) {
    if (!context) return;
    applyKujiContext(context);
    root.classList.remove('is-loading');
    root.setAttribute('aria-busy', 'false');
    $('prizeList').setAttribute('aria-busy', 'false');
    $('ticketBalance').textContent = String(context.remaining_tickets);
    $('ticketWallet').setAttribute('aria-label', `내 남은 티켓 ${context.remaining_tickets}장`);
    $('couponGrid').replaceChildren(...context.tickets.map(ticket => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `coupon${claimed(ticket) ? ' is-used' : ''}`;
      button.disabled = busy || pending !== null || !context.can_draw || claimed(ticket);
      button.setAttribute('aria-label', claimed(ticket)
        ? `${ticket.number}번 쿠폰, ${ticket.prize_name}, ${ticket.nickname}님`
        : `${ticket.number}번 쿠폰, 뽑기`);
      button.innerHTML = couponMarkup(ticket);
      button.addEventListener('click', () => void draw(ticket.number, button));
      return button;
    }));
    $('couponGrid').setAttribute('aria-busy', String(busy));
    const own = context.tickets.filter(ticket => ticket.is_me && claimed(ticket))
      .sort((a, b) => a.claimed_at.localeCompare(b.claimed_at) || a.number - b.number);
    $('drawResult').hidden = own.length === 0;
    $('resultItems').replaceChildren(...own.map(ticket => {
      const item = document.createElement('div');
      item.className = `result-item${ticket.number === animateNumber ? ' is-revealed' : ''}`;
      item.innerHTML = `<span class="result-grade">${escape(ticket.grade)}상</span><div><strong>${escape(ticket.prize_name)}</strong><small>${escape(ticket.nickname)}</small></div>`;
      return item;
    }));
    $('prizeList').innerHTML = context.prizes.map(prize => `<article class="prize-row"><span class="prize-grade">${escape(prize.grade)}상</span><h3>${escape(prize.name)}</h3><span class="prize-stock">${prize.remaining} / ${prize.total}</span></article>`).join('');
    $('kujiLogin').hidden = Boolean(owner && account.profile);
  }
  async function refresh() {
    if (busy || reading) return;
    reading = true;
    if (!context) {
      root.classList.add('is-loading');
      root.setAttribute('aria-busy', 'true');
      message();
    }
    const request = ++revision;
    try {
      if (account.error) throw new Error('ACCOUNT_ERROR');
      const next = await rpc('kuji_context', {requested_event: eventId});
      if (request !== revision) return;
      context = next;
      if (pending !== null) {
        const selected = context.tickets.find(ticket => ticket.number === pending);
        if (!selected || claimed(selected)) savePending(null);
      }
      render();
      message(pending !== null ? '뽑기 결과를 확인해 주세요.' : '', pending !== null);
    } catch (error) {
      if (request === revision) message(messages[error.message] ?? '불러오지 못했습니다. 다시 확인해 주세요.', true);
    } finally {
      reading = false;
      root.classList.remove('is-loading');
      root.setAttribute('aria-busy', 'false');
      $('prizeList').setAttribute('aria-busy', 'false');
      $('couponGrid').setAttribute('aria-busy', String(busy));
    }
  }
  async function draw(number, button, recovering = false) {
    if (busy || !owner || (!recovering && (!context?.can_draw || pending !== null))) return;
    busy = true;
    revision++;
    savePending(number);
    $('kujiRetry').hidden = true;
    message();
    root.querySelectorAll('.coupon').forEach(coupon => { coupon.disabled = true; });
    $('couponGrid').setAttribute('aria-busy', 'true');
    button?.classList.add('is-selected');
    button?.setAttribute('aria-busy', 'true');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      // The server response is the only source of a prize or ticket debit.
      const [next] = await Promise.all([
        rpc('open_kuji_ticket', {requested_event: eventId, requested_number: number}),
        pause(reduced ? 0 : 700),
      ]);
      const selected = next.tickets.find(ticket => ticket.number === number);
      if (!selected?.is_me || !claimed(selected)) throw new Error('INVALID_RESULT');
      button?.classList.remove('is-selected');
      button?.classList.add('is-opening');
      await pause(reduced ? 0 : 220);
      if (button) {
        button.innerHTML = couponMarkup(selected);
        button.classList.add('is-used');
        button.setAttribute('aria-label', `${number}번 쿠폰, ${selected.prize_name}, ${selected.nickname}님`);
      }
      await pause(reduced ? 0 : 300);
      context = next;
      savePending(null);
      busy = false;
      render(number);
    } catch (error) {
      busy = false;
      // A transport failure may follow a committed draw: retain this exact coupon for retry.
      const definite = Object.hasOwn(messages, error.message);
      if (definite) savePending(null);
      await refresh();
      render();
      if (pending !== null) message('결과 확인이 지연되고 있습니다. 다시 확인해 주세요.', true);
      else if (definite) message(messages[error.message]);
    } finally {
      busy = false;
      $('couponGrid').setAttribute('aria-busy', 'false');
    }
  }
  $('kujiRetry').addEventListener('click', () => {
    if (pending !== null) {
      const index = context?.tickets.findIndex(ticket => ticket.number === pending) ?? -1;
      void draw(pending, index >= 0 ? $('couponGrid').children[index] : null, true);
    } else void refresh();
  });
  await refresh();
  const refreshIfVisible = () => { if (!document.hidden && !busy && pending === null) void refresh(); };
  window.addEventListener('focus', refreshIfVisible);
  document.addEventListener('visibilitychange', refreshIfVisible);
  window.addEventListener('pageshow', event => { if (event.persisted) refreshIfVisible(); });
  setInterval(refreshIfVisible, 30000);
}
const root = document.querySelector('#kujiLive');
if (root) void initializeKuji(root);
