import { $, bootstrap } from './admin.js';
import { broadcastPushTest, invokePushTest, preparePushTest } from '../lib/push-test.js';

const scope = '/test/web-push/';
const subscribe = $('pushSubscribe');
const send = $('pushSend');
const unsubscribe = $('pushUnsubscribe');
const status = $('pushStatus');
let registration, applicationServerKey, subscription;
let deviceReady = false;

function show(text) {
  status.textContent = text;
  subscribe.hidden = !deviceReady || !!subscription || Notification.permission === 'denied';
  unsubscribe.hidden = !deviceReady || !subscription;
  send.hidden = false;
  subscribe.disabled = send.disabled = unsubscribe.disabled = false;
}

function busy(text) {
  subscribe.disabled = send.disabled = unsubscribe.disabled = true;
  status.textContent = text;
}

void bootstrap(async () => {
  send.onclick = async () => {
    busy('시험 알림을 보내는 중…');
    try {
      show(await broadcastPushTest());
    } catch {
      show('전체 시험 발송을 완료하지 못했습니다.');
    }
  };

  const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (appleMobile && !navigator.standalone && !matchMedia('(display-mode: standalone)').matches) {
    show('이 기기에서 받으려면 홈 화면에 추가한 뒤 앱을 열어 주세요.');
    return;
  }
  if (!('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)) {
    show('이 브라우저에서는 알림을 받을 수 없습니다.');
    return;
  }

  try {
    ({ registration, applicationServerKey } = await preparePushTest(scope));
    subscription = await registration.pushManager.getSubscription();
    deviceReady = true;
    if (subscription && Notification.permission !== 'denied') await invokePushTest('register', subscription);
    show(subscription ? '이 기기에서 시험 알림을 받을 수 있습니다.' : Notification.permission === 'denied'
      ? '알림이 차단되어 있습니다. 기기 또는 브라우저 설정에서 허용해 주세요.' : '이 기기의 알림을 켜 주세요.');
  } catch {
    show('이 기기의 알림을 준비하지 못했습니다. 새로고침 후 다시 시도해 주세요.');
  }

  subscribe.onclick = async () => {
    busy('알림을 켜는 중…');
    try {
      // On iOS this must start in the click handler, before another async operation.
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      await invokePushTest('register', subscription);
      show('이 기기의 알림을 켰습니다.');
    } catch {
      show(Notification.permission === 'denied' ? '알림이 차단되어 있습니다. 기기 또는 브라우저 설정에서 허용해 주세요.'
        : '알림 구독을 저장하지 못했습니다. 새로고침 후 다시 시도해 주세요.');
    }
  };

  unsubscribe.onclick = async () => {
    busy('구독을 해제하는 중…');
    try {
      const previous = subscription;
      await previous.unsubscribe();
      subscription = await registration.pushManager.getSubscription();
      if (!subscription) await invokePushTest('unregister', previous);
      show(subscription ? '구독을 해제하지 못했습니다. 다시 시도해 주세요.' : '이 기기의 알림 구독을 해제했습니다.');
    } catch {
      show('구독을 해제하지 못했습니다. 다시 시도해 주세요.');
    }
  };
});
