# Train Delay Monitor

Aplikacja webowa do monitorowania odjazdów, opóźnień i biegów pociągów na podstawie danych PLK.

## Produkcja

https://train-delay-monitor1.pages.dev/

## Główne moduły

- `/` – tablica odjazdów
- `/alarmy/` – alarmy pociągów
- `/train` – bieg pociągu
- `/api/departures` – odjazdy ze stacji
- `/api/health` – diagnostyka API
- `/api/limit` – limity API

## Cel projektu

Repozytorium jest backendem i wersją WWW dla przyszłej aplikacji Android **Train Delay Monitor / Alarmy PKP**.

Android będzie korzystał z API Cloudflare, a nie bezpośrednio z API PLK.
