import { $, bootstrap } from './admin.js';
import { invokePushTest, preparePushTest } from '../lib/push-test.js';

const scope = '/test/web-push/';
const subscribe = $('pushSubscribe');
const send = $('pushSend');
const unsubscribe = $('pushUnsubscribe');
const status = $('pushStatus');
let registration, applicationServerKey, subscription;

function show(text) {
  status.textContent = text;
  subscribe.hidden = !!subscription || Notification.permission === 'denied';
  send.hidden = unsubscribe.hidden = !subscription;
  subscribe.disabled = send.disabled = unsubscribe.disabled = false;
}

function busy(text) {
  subscribe.disabled = send.disabled = unsubscribe.disabled = true;
  status.textContent = text;
}

void bootstrap(async () => {
  const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (appleMobile && !navigator.standalone && !matchMedia('(display-mode: standalone)').matches) {
    status.textContent = 'Safari 공유 메뉴에서 홈 화면에 추가한 뒤, 홈 화면 아이콘으로 다시 열어 주세요.';
    return;
  }
  if (!('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)) {
    status.textContent = '이 브라우저에서는 웹 푸시 알림을 사용할 수 없습니다.';
    return;
  }

  try {
    ({ registration, applicationServerKey } = await preparePushTest(scope));
    subscription = await registration.pushManager.getSubscription();
    show(subscription ? '이 기기에서 시험 알림을 받을 수 있습니다.' : Notification.permission === 'denied'
      ? '알림이 차단되어 있습니다. 기기 또는 브라우저 설정에서 허용해 주세요.' : '이 기기의 알림을 켜 주세요.');
  } catch {
    status.textContent = '알림을 준비하지 못했습니다. 새로고침 후 다시 시도해 주세요.';
    return;
  }

  subscribe.onclick = async () => {
    busy('알림을 켜는 중…');
    try {
      // On iOS this must start in the click handler, before another async operation.
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      show('알림을 켰습니다. 이 기기로 시험 발송할 수 있습니다.');
    } catch {
      show(Notification.permission === 'denied' ? '알림이 차단되어 있습니다. 기기 또는 브라우저 설정에서 허용해 주세요.'
        : '알림을 켜지 못했습니다. 권한을 확인하고 다시 시도해 주세요.');
    }
  };

  send.onclick = async () => {
    busy('시험 알림을 보내는 중…');
    try {
      await invokePushTest('send', subscription);
      show('푸시 서비스가 시험 알림을 접수했습니다. 기기의 알림을 확인해 주세요.');
    } catch (error) {
      show(error.message === 'SUBSCRIPTION_EXPIRED'
        ? '이 기기의 구독이 만료되었습니다. 구독을 해제한 뒤 다시 켜 주세요.'
        : '시험 알림을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  };

  unsubscribe.onclick = async () => {
    busy('구독을 해제하는 중…');
    try {
      await subscription.unsubscribe();
      subscription = await registration.pushManager.getSubscription();
      show(subscription ? '구독을 해제하지 못했습니다. 다시 시도해 주세요.' : '이 기기의 알림 구독을 해제했습니다.');
    } catch {
      show('구독을 해제하지 못했습니다. 다시 시도해 주세요.');
    }
  };
});
