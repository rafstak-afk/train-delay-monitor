# Czy zdążę?

Darmowa, webowa tablica odjazdów i monitoring opóźnień pociągów na podstawie
publicznego API PLK (Polskie Linie Kolejowe). Działa w przeglądarce, bez
instalowania aplikacji, bez logowania.

## Produkcja

https://train-delay-monitor1.pages.dev/

Instrukcja dla użytkowników (do promocji, social media): https://train-delay-monitor1.pages.dev/jak-dziala/

## Stos technologiczny

Cloudflare Pages + Pages Functions. Strony to statyczne pliki `index.html`
per katalog (bez frameworka/buildu), logika serwerowa w `functions/`
(JS/TS), proxy do PLK w `functions/api/[[path]].ts` z białą listą
dozwolonych endpointów.

## Strony (katalogi = ścieżki)

- `/` – tablica odjazdów: wyszukiwanie stacji, ulubione stacje, alarm
  opóźnień/odwołań z przyczyną (gdy PLK ją poda), menu kontekstowe wiersza
  (długi dotyk / prawy przycisk myszy), dodawanie do kalendarza i do
  Moich pociągów.
- `/moje-pociagi/` – lista śledzonych na stałe kursów (gwiazdka, zmiana
  kolejności, ostatnia potwierdzona stacja).
- `/train` (`functions/train.js`) – pełny bieg wybranego pociągu: wszystkie
  stacje, czasy, opóźnienia, przyczyna zakłócenia; zaznaczanie stacji
  wsiadania/wysiadania i zapis do dzienniczka.
- `/dziennik/` – dzienniczek podróży: ulubione (typowe, powtarzalne) trasy,
  historia zapisanych przejazdów z autozapisem edycji, eksport do XLSX.
- `/profil/` – opcjonalna synchronizacja ustawień (ulubione stacje/pociągi,
  dzienniczek) między urządzeniami przez token, bez logowania/hasła/e-maila.
- `/jak-dziala/` – jedna, spójna instrukcja dla użytkowników końcowych,
  opisująca wszystkie powyższe funkcje.
- `/kontakt/` – formularz zgłaszania uwag/błędów (otwiera e-mail) oraz
  sekcja RODO i prywatność.
- `/bilety/` – pomocniczy dobór biletu.
- `/opoznienia/tgzm.html` – TGZM (Tablica Głównych Zakłóceń/Monitor – skrót
  używany w UI jako „🚋 TGZM”).

## Główne API (Pages Functions)

- `functions/api/departures.js` – odjazdy ze stacji, wzbogacone o
  przyczyny opóźnień/odwołań (`/disruptions` PLK) dla wierszy w stanie
  alarmowym.
- `functions/api/train-details.js` – pełna trasa pociągu wraz z
  pogrupowanymi przyczynami zakłóceń na całej trasie.
- `functions/api/profile.js` – zapis/odczyt profilu użytkownika w
  Cloudflare KV (`USER_PROFILES`), kluczowany losowym tokenem.
- `functions/api/contact.js` – adres docelowy formularza kontaktowego.
- `functions/api/[[path]].ts` – generyczny proxy do PLK z białą listą
  dozwolonych segmentów ścieżki (`schedules`, `operations`, `dictionaries`,
  `apikey`); inne segmenty (np. `disruptions`) są obsługiwane wprost we
  właściwych endpointach powyżej, nie przez ten ogólny proxy.
- `/api/health`, `/api/limit` – diagnostyka i limity wywołań API PLK.

## Dane źródłowe

Rozkład jazdy, opóźnienia i przyczyny zakłóceń pochodzą z publicznego API
PLK (`pdp-api.plk-sa.pl`). Aplikacja nie jest oficjalnym serwisem PKP ani
PLK.

## Prywatność

Pełny opis w `/kontakt/#rodo` — w skrócie: brak zapisywania adresów IP i
danych osobowych; profil (opcjonalny) przechowuje wyłącznie własne
ustawienia użytkownika.
