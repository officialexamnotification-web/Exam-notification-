importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');
importScripts('/api/firebase-config.js');

firebase.initializeApp(self.DYNAMIC_FIREBASE_CONFIG);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.data?.title || payload.notification?.title || 'Sarkari Naukri Update';
  const notificationOptions = {
    body: payload.data?.body || payload.notification?.body,
    icon: '/icon.svg',
    data: {
       url: payload.data?.url || '/'
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data.url;
  
  if (urlToOpen) {
      event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
          for (let client of windowClients) {
            if (client.url === new URL(urlToOpen, self.location.origin).href && 'focus' in client) {
                return client.focus();
            }
          }
          if (clients.openWindow) {
              return clients.openWindow(urlToOpen);
          }
        })
      );
  }
});
