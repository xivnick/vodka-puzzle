const page = new URL(self.registration.scope);

self.addEventListener('push', event => {
  const { title, body } = event.data.json();
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: new URL('icon-192.png?v=2', page).href,
    tag: 'vodka-puzzle-push-test',
    renotify: true,
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).pathname === page.pathname);
    return existing ? existing.focus() : self.clients.openWindow(page.href);
  })());
});
