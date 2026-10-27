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

// Prawdziwy Web Push (push-tick.js na serwerze) — dochodzi NAWET gdy karta
// z aplikacją jest zamknięta, bo to zdarzenie budzi sam Service Worker.
// Bez event.waitUntil(showNotification(...)) przeglądarka uznałaby to za
// "cichy push" i pokazałaby własne, generyczne powiadomienie zamiast
// naszego — dlatego ZAWSZE wołamy showNotification, nawet przy błędzie
// parsowania danych.
self.addEventListener("push", event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {}
  const title = data.title || "Alarm pociągów";
  const body = data.body || "Sprawdź aktualny status na Moich pociągach.";
  const url = data.url || "/moje-pociagi/";
  event.waitUntil(
    // Wibracja w rytmie "ta-dam ta-dam" (stukot kół) — dźwięku powiadomienia
    // przeglądarka nie pozwala zmienić, wibrację na Androidzie tak.
    self.registration.showNotification(title, { body, vibrate: [120,80,120,400,120,80,120], data: { url } })
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
