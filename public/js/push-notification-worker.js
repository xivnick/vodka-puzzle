const page = new URL(self.registration.scope);

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));

self.addEventListener('push', event => {
  const { title, body, path, tag = 'vodka-puzzle-push-test' } = event.data.json();
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: new URL('/brand/vodka-puzzle-icon-192.png?v=2', page).href,
    tag,
    data: { path },
    renotify: true,
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const path = event.notification.data?.path;
    const target = path === '/daily-sudoku/' || (typeof path === 'string' && /^\/\d{6}_\d{2}\/$/.test(path))
      ? new URL(path, page) : page;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).pathname === target.pathname);
    return existing ? existing.focus() : self.clients.openWindow(target.href);
  })());
});
