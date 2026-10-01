const CACHE_NAME = "train-delay-monitor-v1";

const STATIC_FILES = [
  "/",
  "/index.html",
  "/manifest.webmanifest"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Bez tego kliknięcie powiadomienia o alarmie (showAlarmNotification w
// index.html) nic nie robiło — przeglądarka samo z siebie nie wie, dokąd
// ma zaprowadzić, trzeba to obsłużyć jawnie. Jeśli karta z aplikacją jest
// już otwarta, tylko ją aktywujemy i przenawigowujemy (bez otwierania
// drugiej); w przeciwnym razie otwieramy nową.
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  const targetUrl = new URL(url, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) return client.navigate(targetUrl);
          return;
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
