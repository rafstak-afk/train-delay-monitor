// Pomiar dojścia pieszo (TEST — tylko profil autora). Przeniesione z Moich pociągów do planera (zakładka 🚆🚌 Pociąg + GZM).
// Wymaga na stronie <div id="walkMeasure"></div>. Wyniki w localStorage walkMeasureV1 (te same co wcześniej).
(function () {
function wmEsc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; }); }
// === Pomiar dojścia peron → przystanek (TEST — tylko profil autora) ===
// Narzędzie autora do sprawdzania czasów dojścia pieszo (dla „Przesiadek GZM”
// i codziennego dojazdu): wybór rodzaju trasy, Start na początku, Stop na końcu.
// Przy obu zapisujemy położenie GPS (jeśli telefon pozwoli). Nazwa i peron są
// opcjonalne. Stoper liczy od zapisanej chwili startu (przeżyje zgaszony ekran).
const WM_KEY = 'walkMeasureV1';
const WM_KINDS = [
  { id: 'peron-przystanek', from: 'peron', to: 'przystanek', label: '🚉 → 🚏 peron → przystanek' },
  { id: 'dom-peron', from: 'dom', to: 'peron', label: '🏠 → 🚉 dom → peron' },
  { id: 'peron-dom', from: 'peron', to: 'dom', label: '🚉 → 🏠 peron → dom' },
  { id: 'praca-peron', from: 'praca', to: 'peron', label: '🏢 → 🚉 praca → peron' },
  { id: 'peron-praca', from: 'peron', to: 'praca', label: '🚉 → 🏢 peron → praca' },
  { id: 'inne', from: 'start', to: 'meta', label: '✏️ inne' }
];
const WM_START = { peron: '▶ Start — wysiadam', dom: '▶ Wychodzę z domu', praca: '▶ Wychodzę z pracy', start: '▶ Start' };
const WM_STOP = { przystanek: '⏹ Jestem na przystanku', peron: '⏹ Jestem na peronie', dom: '⏹ Jestem w domu', praca: '⏹ Jestem w pracy', meta: '⏹ Meta' };
const WM_NAMEPH = { przystanek: 'Nazwa przystanku (opcjonalnie)', peron: 'Stacja (opcjonalnie)', dom: 'Notatka (opcjonalnie)', praca: 'Notatka (opcjonalnie)', meta: 'Dokąd (opcjonalnie)' };
function wmKind(id) { return WM_KINDS.find(k => k.id === id) || WM_KINDS[0]; }
function wmShort(k) { return k.label.replace(/^\S+ → \S+ /, '').replace(/^✏️ /, ''); }
function wmState() { try { return JSON.parse(localStorage.getItem(WM_KEY)) || {}; } catch (e) { return {}; } }
function wmSave(st) { try { localStorage.setItem(WM_KEY, JSON.stringify(st)); } catch (e) {} }
// Profil: lista pomiarów pod kluczem walkMeasures. Zmiana = świeży odczyt profilu, jedna operacja, zapis.
function wmProf() { return !!(window.ProfileSync && ProfileSync.getToken && ProfileSync.getToken()); }
function wmPullProfile() {
  if (!wmProf() || !wmEnabled()) return Promise.resolve();
  return ProfileSync.pull().then(d => {
    if (!d) return;
    const st = wmState();
    if (Array.isArray(d.walkMeasures)) {
      if (JSON.stringify(d.walkMeasures) !== JSON.stringify(st.results || [])) { st.results = d.walkMeasures; wmSave(st); renderWalkMeasure(); }
    } else if ((st.results || []).length) ProfileSync.push({ walkMeasures: st.results });
  }).catch(() => {});
}
function wmProfileOp(op) {
  if (!wmProf()) return;
  ProfileSync.pull().then(d => {
    const base = d && Array.isArray(d.walkMeasures) ? d.walkMeasures : (wmState().results || []);
    const list = op(base.slice());
    const st = wmState(); st.results = list; wmSave(st); renderWalkMeasure();
    return ProfileSync.push({ walkMeasures: list });
  }).catch(() => {});
}
function wmEnabled() { try { return localStorage.getItem('showVersionBadge') === '1'; } catch (e) { return false; } }
function wmFmt(ms) { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0') + ' s'; }
function wmGeo() {
  return new Promise(res => {
    if (!navigator.geolocation) return res(null);
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; res(null); } }, 12000);
    navigator.geolocation.getCurrentPosition(p => { if (done) return; done = true; clearTimeout(t); res({ lat: +p.coords.latitude.toFixed(6), lon: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy) }); },
      () => { if (done) return; done = true; clearTimeout(t); res(null); }, { enableHighAccuracy: true, timeout: 11000, maximumAge: 5000 });
  });
}
function wmGeoTxt(g) { return g ? g.lat + ',' + g.lon + ' (±' + g.acc + ' m)' : 'brak GPS'; }
function wmWhen(at) { return new Date(at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
function wmLine(r) {
  return wmWhen(r.at) + ' · ' + wmShort(wmKind(r.kind)) + ' · ' + (r.platform ? 'peron ' + r.platform + ' · ' : '') + (r.name || '—') + ' · ' + wmFmt(r.ms) + ' · start ' + wmGeoTxt(r.from) + ' → meta ' + wmGeoTxt(r.to);
}
let wmTimer = null;
const WM_BTN = 'border:0;border-radius:10px;color:#fff;font-weight:800;padding:9px 12px;font-size:13.5px;cursor:pointer;';
const WM_CHIP = on => 'border:1px solid ' + (on ? '#0b57d0' : '#34495e') + ';background:' + (on ? '#173055' : '#223244') + ';color:#fff;border-radius:16px;padding:6px 11px;font-size:12.5px;cursor:pointer';
function renderWalkMeasure() {
  const box = document.getElementById('walkMeasure'); if (!box) return;
  clearInterval(wmTimer);
  if (!wmEnabled()) { box.innerHTML = ''; return; }
  const st = wmState(), results = st.results || [], names = st.names || [];
  const open = st.open || !!st.running;
  const head = '<button type="button" id="wmToggle" style="all:unset;cursor:pointer;display:flex;justify-content:space-between;width:100%;font-weight:900;font-size:15px">' +
    '<span>⏱️ Pomiar dojścia pieszo' + (st.running ? ' · <span id="wmClockMini">' + wmFmt(Date.now() - st.running.start) + '</span>' : (results.length ? ' (' + results.length + ')' : '')) + '</span><span>' + (open ? '▴' : '▾') + '</span></button>';
  let body = '';
  if (open && st.running) {
    const K = wmKind(st.running.kind);
    body = '<div style="font-size:32px;font-weight:900;margin:6px 0" id="wmClock">' + wmFmt(Date.now() - st.running.start) + '</div>' +
      '<div style="color:#b8c3cf;font-size:12.5px">' + wmEsc(K.label) + (st.running.platform ? ' · peron ' + wmEsc(st.running.platform) : '') + ' · start: ' + wmEsc(wmGeoTxt(st.running.from)) + '</div>' +
      '<input id="wmName" placeholder="' + wmEsc(WM_NAMEPH[K.to]) + '" list="wmNames" style="width:100%;margin-top:8px;padding:10px;border-radius:9px;border:1px solid #34495e;background:#223244;color:#fff;font-size:15px">' +
      '<datalist id="wmNames">' + names.map(n => '<option value="' + wmEsc(n) + '">').join('') + '</datalist>' +
      (names.length ? '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">' + names.slice(0, 6).map(n => '<button type="button" class="wm-name" data-n="' + wmEsc(n) + '" style="' + WM_CHIP(false) + '">' + wmEsc(n) + '</button>').join('') + '</div>' : '') +
      '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button type="button" id="wmStop" style="' + WM_BTN + 'background:#15803d;font-size:15px;padding:11px 14px">' + wmEsc(WM_STOP[K.to]) + '</button>' +
      '<button type="button" id="wmCancel" style="' + WM_BTN + 'background:#4b5563">Anuluj</button></div>';
  } else if (open) {
    const K = wmKind(st.kind), withPlat = K.from === 'peron' || K.to === 'peron';
    body = '<div style="color:#d8e2ee;font-size:13px;line-height:1.45;margin-top:6px">Wybierz, co mierzysz, kliknij <b>Start</b> na początku i <b>Stop</b> na końcu. Zapiszę czas i położenie z GPS.</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">' + WM_KINDS.map(k => '<button type="button" class="wm-kind" data-k="' + k.id + '" style="' + WM_CHIP(k.id === K.id) + '">' + wmEsc(k.label) + '</button>').join('') + '</div>' +
      (withPlat ? '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">' + ['', '1', '2', '3', '4', '5'].map(p => '<button type="button" class="wm-plat" data-p="' + p + '" style="' + WM_CHIP((st.platform || '') === p) + '">' + (p ? 'peron ' + p : 'peron ?') + '</button>').join('') + '</div>' : '') +
      '<div style="margin-top:10px"><button type="button" id="wmStart" style="' + WM_BTN + 'background:#0b57d0;font-size:15px;padding:11px 16px">' + wmEsc(WM_START[K.from]) + '</button></div>';
  }
  if (open && results.length) {
    body += '<div style="margin-top:10px;font-size:12.5px;line-height:1.5">' + results.slice().reverse().map((r, i) => '<div style="border-top:1px solid #2a3a4c;padding:4px 0">✅ ' + wmEsc(wmShort(wmKind(r.kind))) + (r.name ? ': <b>' + wmEsc(r.name) + '</b>' : '') + ' — <b>' + wmFmt(r.ms) + '</b>' + (r.platform ? ' · peron ' + wmEsc(r.platform) : '') + ' <span style="color:#b8c3cf">· ' + wmEsc(wmWhen(r.at)) + (r.from && r.to ? '' : ' · bez GPS') + '</span> <button type="button" class="wm-del" data-i="' + (results.length - 1 - i) + '" style="border:0;background:none;color:#ff4d4d;cursor:pointer">✕</button></div>').join('') + '</div>' +
      '<div style="margin-top:8px"><button type="button" id="wmCopy" style="' + WM_BTN + 'background:#4b5563">📋 Kopiuj wyniki</button></div>';
  }
  box.innerHTML = '<div style="background:rgba(255,212,0,.07);border:1px solid ' + (st.running ? '#ffd400' : '#6b5d1a') + ';border-radius:12px;padding:10px 12px;margin:0 0 12px">' + head + body + '</div>';
  if (st.running) wmTimer = setInterval(() => { const ms = Date.now() - (wmState().running || { start: Date.now() }).start; ['wmClock', 'wmClockMini'].forEach(id => { const c = document.getElementById(id); if (c) c.textContent = wmFmt(ms); }); }, 1000);
}
document.addEventListener('click', async e => {
  const b = e.target.closest('#walkMeasure button'); if (!b) return;
  const st = wmState();
  if (b.id === 'wmToggle') { st.open = !(st.open || st.running); wmSave(st); }
  else if (b.classList.contains('wm-kind')) { st.kind = b.dataset.k; wmSave(st); }
  else if (b.classList.contains('wm-plat')) { st.platform = b.dataset.p; wmSave(st); }
  else if (b.classList.contains('wm-name')) { const i = document.getElementById('wmName'); if (i) i.value = b.dataset.n; return; }
  else if (b.id === 'wmStart') {
    const K = wmKind(st.kind), withPlat = K.from === 'peron' || K.to === 'peron';
    st.running = { start: Date.now(), kind: K.id, platform: withPlat ? (st.platform || '') : '', from: null }; st.open = true; wmSave(st); renderWalkMeasure();
    const g = await wmGeo(); const s2 = wmState(); if (s2.running && s2.running.start === st.running.start) { s2.running.from = g; wmSave(s2); }
  }
  else if (b.id === 'wmStop' && st.running) {
    const ms = Date.now() - st.running.start, name = ((document.getElementById('wmName') || {}).value || '').trim();
    b.disabled = true; b.textContent = '⏳ zapisuję położenie…';
    const g = await wmGeo();
    const s2 = wmState(); if (!s2.running) return;
    const item = { at: new Date().toISOString(), kind: s2.running.kind, ms, name, platform: s2.running.platform, from: s2.running.from, to: g };
    (s2.results = s2.results || []).push(item);
    wmProfileOp(list => list.filter(x => x.at !== item.at).concat([item]));
    if (name) s2.names = [name].concat((s2.names || []).filter(n => n !== name)).slice(0, 12);
    s2.running = null; wmSave(s2);
  }
  else if (b.id === 'wmCancel') { st.running = null; wmSave(st); }
  else if (b.classList.contains('wm-del')) { if (!confirm('Usunąć ten pomiar?')) return; const gone = (st.results || []).splice(+b.dataset.i, 1)[0]; wmSave(st); if (gone) wmProfileOp(list => list.filter(x => x.at !== gone.at)); }
  else if (b.id === 'wmCopy') {
    const txt = 'Pomiary dojścia pieszo:\n' + (st.results || []).map(wmLine).join('\n');
    try { await navigator.clipboard.writeText(txt); b.textContent = '✅ Skopiowano'; setTimeout(renderWalkMeasure, 1500); return; } catch (err) { prompt('Skopiuj wyniki:', txt); }
  }
  renderWalkMeasure();
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { renderWalkMeasure(); wmPullProfile(); } });
setTimeout(() => { renderWalkMeasure(); wmPullProfile(); }, 0);
})();
