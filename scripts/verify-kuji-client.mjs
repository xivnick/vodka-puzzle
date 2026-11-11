// Isolated frontend checks: no browser, real accounts, or live prizes are used.
import assert from 'node:assert/strict';
const timers = [];
const originalTimeout = globalThis.setTimeout;
const originalInterval = globalThis.setInterval;
globalThis.setTimeout = (run, duration) => { timers.push({run, duration}); };
globalThis.setInterval = () => 0;
const makeElement = () => ({
  hidden: true, disabled: false, textContent: '', innerHTML: '', children: [], attributes: {}, listeners: {},
  classList: {add() {}, remove() {}},
  setAttribute(name, value) { this.attributes[name] = value; },
  replaceChildren(...children) { this.children = children; },
  addEventListener(name, callback) { this.listeners[name] = callback; },
});
let elements, server, transportFailure, readFailure, drawCalls, lastNumber;
const storage = new Map();
globalThis.sessionStorage = {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)};
globalThis.matchMedia = () => ({matches: false});
const get = id => {
  if (!elements.has(id)) elements.set(id, makeElement());
  return elements.get(id);
};
globalThis.document = {querySelector: () => null, getElementById: get, createElement: makeElement, addEventListener() {}, hidden: false};
globalThis.window = {puzzleAuthReady: Promise.resolve(), addEventListener() {}};
const {initializeKuji} = await import('../src/scripts/kuji-live.js');
async function boot({balance = 2, restored = false, anonymous = false} = {}) {
  elements = new Map();
  if (!restored) {
    storage.clear(); drawCalls = 0; transportFailure = false; readFailure = false;
    server = {remaining_tickets: balance, can_draw: balance > 0, status: 'active', prizes: [{grade:'A',name:'서버 상품',remaining:3,total:3}], tickets: [1,2,3].map(number => ({number, claimed_at:null, is_me:false}))};
  }
  window.puzzleAccount = {user: anonymous ? null : {id:'fixture'}, profile: anonymous ? null : {nickname:'<퍼즐러>'}, client: {
    rpc(name, args) {
      return {async abortSignal() {
        if (name === 'kuji_context') {
          if (readFailure) throw new Error('network read');
          return {data: structuredClone(server)};
        }
        drawCalls++; lastNumber = args.requested_number;
        const ticket = server.tickets.find(t => t.number === lastNumber);
        if (!ticket.is_me) {
          Object.assign(ticket, {is_me:true,claimed_at:`2026-11-11T04:00:0${lastNumber}Z`,nickname:'<퍼즐러>',prize_name:'서버 상품',grade:'A'});
          server.remaining_tickets--; server.can_draw = server.remaining_tickets > 0; server.prizes[0].remaining--;
        }
        if (transportFailure) throw new Error('network after commit');
        return {data: structuredClone(server)};
      }};
    },
  }};
  const root = {...makeElement(), dataset:{event:'fixture-event'}, querySelectorAll: () => get('couponGrid').children};
  await initializeKuji(root);
}
async function settle() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
async function tick(duration) {
  await settle();
  const timer = timers.shift();
  assert.equal(timer?.duration, duration);
  timer.run(); await settle();
}
try {
  await boot();
  const coupon = get('couponGrid').children[0];
  coupon.listeners.click(); coupon.listeners.click();
  await settle();
  assert.equal(drawCalls, 1);
  assert.equal(get('drawResult').hidden, true);
  await tick(700);
  assert.equal(get('drawResult').hidden, true);
  await tick(220);
  assert.match(coupon.innerHTML, /서버 상품/);
  assert.match(coupon.innerHTML, /&lt;퍼즐러&gt;/);
  assert.equal(get('drawResult').hidden, true);
  await tick(300);
  assert.equal(get('resultItems').children.length, 1);
  assert.equal(get('ticketBalance').textContent, '1');
  assert.equal(get('couponGrid').children[1].disabled, false);
  get('couponGrid').children[1].listeners.click();
  await tick(700); await tick(220); await tick(300);
  assert.equal(get('resultItems').children.length, 2);
  assert.equal(get('ticketBalance').textContent, '0');
  assert(get('couponGrid').children.every(c => c.disabled));

  await boot({balance:1});
  transportFailure = true; readFailure = true;
  get('couponGrid').children[2].listeners.click();
  await settle();
  assert.equal(drawCalls, 1);
  assert.equal(get('kujiRetry').hidden, false);
  assert(get('couponGrid').children.every(c => c.disabled));
  // The rejected Promise.all still owns its animation delay; let it finish.
  await tick(700);
  transportFailure = false; readFailure = false;
  get('kujiRetry').listeners.click();
  await tick(700); await tick(220); await tick(300);
  assert.equal(lastNumber, 3);
  assert.equal(server.remaining_tickets, 0);
  assert.equal(get('resultItems').children.length, 1);
  assert.equal(storage.size, 0);
  await boot({restored:true});
  assert.equal(get('resultItems').children.length, 1);
  assert.equal(get('ticketBalance').textContent, '0');

  await boot({balance:0, anonymous:true});
  assert.equal(get('kujiLogin').hidden, false);
  assert(get('couponGrid').children.every(c => c.disabled));
  console.log('PASS: server-selected prize, escaping, reveal timing, multiple draws, duplicate click, unknown-commit same-coupon retry, restored result, anonymous read-only');
} finally {
  globalThis.setTimeout = originalTimeout;
  globalThis.setInterval = originalInterval;
}
