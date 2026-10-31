// Stacje bez przystanku ZTM w zwykłym zasięgu pieszym: najbliższe przystanki (do 2,5 km, w linii prostej)
// zapisujemy w index.json jako far: [[nazwa, metry], …] — dla przycisku 🚌 „D” na stronie pociągu
// i karty „dalej niż zwykle” w planerze (bez ładowania całej sieci).
export const FAR_MAX = 2500;
function hav(a, b, c, d) { const R = 6371000, t = Math.PI / 180, x = Math.sin((c - a) * t / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin((d - b) * t / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
export function addFar(index, net) {
  let n = 0;
  for (const st of index.stations) {
    delete st.far;
    if (st.s && st.s.length) continue;
    const best = new Map();
    for (const p of net.stops) {
      const d = hav(st.lat, st.lon, p[1], p[2]); if (d > FAR_MAX) continue;
      const nm = net.names[p[0]]; if (!best.has(nm) || best.get(nm) > d) best.set(nm, d);
    }
    const list = [...best].sort((a, b) => a[1] - b[1]).slice(0, 3).map(([nm, d]) => [nm, Math.round(d)]);
    if (list.length) { st.far = list; n++; }
  }
  return n;
}
