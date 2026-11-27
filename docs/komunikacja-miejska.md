# Komunikacja miejska — jak dodać kolejne miasto

Od 27.11.2026 (TODO 136, etap 4) aplikacja traktuje komunikację miejską jako **wymiennego dostawcę**.
Dziś jedynym dostawcą jest **GZM** (ZTM Górnośląsko-Zagłębiowskiej Metropolii). Kolejne miasta
(np. Kraków, Wrocław — patrz TODO 1 i 56) dodaje się bez zmian w wyszukiwarce kolejowej.

## Kto korzysta z dostawców

| Miejsce | Co robi |
|---|---|
| Wyszukiwarka kolejowa (🚆 Szukaj) | przy wątpliwej przesiadce / odwołaniu: „🚌 Zamiast komunikacją (GZM): …” |
| Pociąg + GZM | pełne wyszukiwanie pociąg + komunikacja, dojścia, mapki |
| Pilnowane | „🚆🚌 Plan B z autobusami” (otwiera Pociąg + GZM) |

Wyszukiwarka kolejowa pyta **rejestr** (`city-transit.js`), nie konkretne miasto:

```js
CityTransit.altJourney(fromStation, toStation, depMin, date)
// → { leave, dep, arr, lines: ["M3"], live, delay, transfers, from, to, provider: { id, label } } | null
```

Rejestr pyta wszystkich dostawców, którzy obsługują **obie** stacje, i zwraca wynik najwcześniej na miejscu.

## Kontrakt dostawcy

```js
CityTransit.register({
  id: "krk",                    // krótki identyfikator
  label: "MPK Kraków",          // pokazywany przy propozycji („🚌 Zamiast komunikacją (MPK Kraków): …”)
  covers: name => Promise<bool>,// czy stacja PLK o tej nazwie ma przystanki w zasięgu dojścia
  altJourney: (from, to, depMin, date) => Promise<wynik|null>
});
```

Wymagania wobec `altJourney`:
- liczy **w przeglądarce**, bez zapytań do PLK (limit 20 tys./dobę — patrz pamięć „PLK quota”);
- uwzględnia **dane na żywo** (GTFS-Realtime), gdy są świeże; pole `live` = czy wynik naprawdę opiera się na danych na żywo
  (inaczej w karcie „○ wg rozkładu”);
- czas dojścia peron ↔ przystanek wliczony (`leave` = kiedy wyjść z peronu, `arr` = na miejscu, z dojściem).

## Dane miasta (wzorzec: GZM)

| Plik / adres | Źródło | Jak powstaje |
|---|---|---|
| `index.json` — stacje PLK z najbliższymi przystankami (`s`: kod, czas dojścia…) | GTFS + OpenStreetMap | `tools/gzm/build.mjs` (codziennie, GitHub Action `gzm-data`) |
| `network/<data>.json` — sieć dla RAPTOR (przystanki, kursy, wzorce) | GTFS | jw. |
| `stations/<id>.json`, `stopwalk/*.json` — dojścia piesze z mapy | OpenStreetMap | jw. |
| `/api/gzm-rt` — opóźnienia i pozycje pojazdów | GTFS-Realtime ZTM | funkcja Cloudflare, pamięć 20 s |

Nowe miasto = kopia tego zestawu z własnym `config.json` (adres GTFS, `bbox`, promienie dojść), własna gałąź / katalog
danych i własny pośrednik GTFS-RT, a w przeglądarce rejestracja dostawcy (jak `gzm-view.js` → `CityTransit.register`).
Wspólny algorytm wyszukiwania (`gzm-raptor.js`) działa na każdym zbiorze w tym samym formacie.

## Licencje

Każde miasto: sprawdzić licencję GTFS i GTFS-RT (GZM: CC BY 4.0, podpis w zakładce Pociąg + GZM) i dopisać podpis
źródła w widoku. Przed startem miasta — pytanie do przewoźnika o warunki (jak pismo do ZTP Kraków z 12.11.2026).
