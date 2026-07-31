/**
 * Logika Aplikacji - Monitorowane Pociągi
 */

const CACHE_DURATION_MS = 5 * 60 * 1000; // Pamięć podręczna na 5 minut
const STORAGE_KEY = 'monitored_trains_list';

let monitoredTrains = loadMonitoredFromStorage();
let activeTrainId = null;

// Słownik dla pamięci podręcznej API w pamięci podręcznej przeglądarki
const dataCache = {
  trainDetails: {} // [trainId] => { timestamp, data }
};

// Elementy DOM
const listView = document.getElementById('listView');
const detailsView = document.getElementById('detailsView');
const monitoredList = document.getElementById('monitoredList');
const emptyState = document.getElementById('emptyState');

const stationInput = document.getElementById('stationInput');
const autocompleteList = document.getElementById('autocompleteList');
const departuresSection = document.getElementById('departuresSection');
const departuresTitle = document.getElementById('departuresTitle');
const departuresList = document.getElementById('departuresList');
const closeDeparturesBtn = document.getElementById('closeDeparturesBtn');

const backToListBtn = document.getElementById('backToListBtn');
const detailTrainName = document.getElementById('detailTrainName');
const detailTrainNumber = document.getElementById('detailTrainNumber');
const detailTotalDelay = document.getElementById('detailTotalDelay');
const routeTimeline = document.getElementById('routeTimeline');

const fabRefresh = document.getElementById('fabRefresh');

// Inicjalizacja
document.addEventListener('DOMContentLoaded', () => {
  renderMonitoredList();
  setupEventListeners();
});

function setupEventListeners() {
  // Przycisk "Powrót do monitorowanych"
  backToListBtn.addEventListener('click', () => {
    showListView();
  });

  // Pływający Przycisk Odświeżania (FAB)
  fabRefresh.addEventListener('click', () => {
    handleFabRefresh();
  });

  // Wyszukiwarka Stacji
  let debounceTimeout;
  stationInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimeout);
    const query = e.target.value.trim();
    if (query.length < 2) {
      autocompleteList.classList.add('hidden');
      return;
    }
    debounceTimeout = setTimeout(() => fetchStationSuggestions(query), 250);
  });

  closeDeparturesBtn.addEventListener('click', () => {
    departuresSection.classList.add('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box')) {
      autocompleteList.classList.add('hidden');
    }
  });
}

// LocalStorage
function loadMonitoredFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (err) {
    return [];
  }
}

function saveMonitoredToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(monitoredTrains));
  } catch (err) {
    console.error('Błąd zapisu w localStorage:', err);
  }
}

// ==========================================
// WIDOK 1: LISTA MONITOROWANYCH POCIĄGÓW
// ==========================================
function showListView() {
  detailsView.classList.add('hidden');
  detailsView.classList.remove('active');
  listView.classList.remove('hidden');
  listView.classList.add('active');
  activeTrainId = null;
  renderMonitoredList();
}

function renderMonitoredList() {
  monitoredList.innerHTML = '';

  if (monitoredTrains.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  monitoredTrains.forEach((train) => {
    const card = document.createElement('div');
    card.className = 'monitored-card';

    // Opóźnienie i czas bez bezpośrednich obliczeń na froncie - z API
    const delayVal = train.delay ?? 0;
    const delayText = delayVal > 0 ? `+${delayVal} min` : 'O czasie';
    const delayClass = delayVal > 0 ? 'delayed' : 'on-time';

    card.innerHTML = `
      <div class="card-header">
        <div class="train-info">
          <h3>${escapeHtml(train.name || 'Pociąg')}</h3>
          <span class="train-number">${escapeHtml(train.number || train.id || '')}</span>
        </div>
        <button class="btn-delete" title="Usuń z monitorowanych" aria-label="Usuń z monitorowanych">🗑️</button>
      </div>
      <div class="card-route">
        <span>${escapeHtml(train.from || 'Początek')}</span>
        <span class="route-arrow">➔</span>
        <span>${escapeHtml(train.to || 'Koniec')}</span>
      </div>
      <div class="card-footer">
        <span class="delay-tag ${delayClass}">${delayText}</span>
        <small class="text-muted">${train.lastUpdate ? 'Aktualizacja: ' + train.lastUpdate : ''}</small>
      </div>
    `;

    // 1. Klikalność całej karty otwiera widok szczegółowy trasy
    card.addEventListener('click', () => {
      openTrainDetails(train.id || train.number);
    });

    // 2. Bezpieczny przycisk usuwania (stopPropagation)
    const deleteBtn = card.querySelector('.btn-delete');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Powstrzymuje otwarcie widoku szczegółów!
      removeMonitoredTrain(train.id || train.number);
    });

    monitoredList.appendChild(card);
  });
}

function addMonitoredTrain(train) {
  const trainId = train.id || train.number;
  if (!monitoredTrains.some(t => (t.id || t.number) === trainId)) {
    monitoredTrains.push({
      id: trainId,
      name: train.name || train.trainName || `Pociąg ${trainId}`,
      number: train.number || train.trainNumber || trainId,
      from: train.from || train.origin || 'Stacja początkowa',
      to: train.to || train.destination || 'Stacja docelowa',
      delay: train.delay ?? 0,
      lastUpdate: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    saveMonitoredToStorage();
    renderMonitoredList();
  }
}

function removeMonitoredTrain(trainId) {
  monitoredTrains = monitoredTrains.filter(t => (t.id || t.number) !== trainId);
  saveMonitoredToStorage();
  renderMonitoredList();
}

// ==========================================
// WIDOK 2: SZCZEGÓŁY BIEGU POCIĄGU
// ==========================================
async function openTrainDetails(trainId, forceRefresh = false) {
  activeTrainId = trainId;

  // Przełączenie widoku natychmiastowo
  listView.classList.add('hidden');
  listView.classList.remove('active');
  detailsView.classList.remove('hidden');
  detailsView.classList.add('active');

  // Pamięć Podręczna (Cache 5 min)
  const cached = dataCache.trainDetails[trainId];
  const now = Date.now();

  if (!forceRefresh && cached && (now - cached.timestamp < CACHE_DURATION_MS)) {
    // Dane w cache są świeże (< 5 min) – renderowanie bez natychmiastowego zapytania do API
    renderTrainDetails(cached.data);
    return;
  }

  // Brak świeżych danych -> Pobranie z API
  showDetailsLoading();
  try {
    const data = await fetchTrainDetailsFromAPI(trainId);
    dataCache.trainDetails[trainId] = {
      timestamp: Date.now(),
      data: data
    };
    renderTrainDetails(data);
  } catch (err) {
    console.error('Błąd pobierania trasy:', err);
    routeTimeline.innerHTML = '<p class="error-msg">Nie udało się pobrać szczegółów trasy pociągu.</p>';
  }
}

function showDetailsLoading() {
  detailTrainName.textContent = 'Ładowanie danych...';
  detailTrainNumber.textContent = '---';
  detailTotalDelay.textContent = '...';
  detailTotalDelay.className = 'total-delay-badge';
  routeTimeline.innerHTML = '<p class="loading-msg">Pobieranie aktualnej trasy z API...</p>';
}

async function fetchTrainDetailsFromAPI(trainId) {
  const response = await fetch(`/api/train-details?trainId=${encodeURIComponent(trainId)}`);
  if (!response.ok) {
    const resFallback = await fetch(`/api/train?id=${encodeURIComponent(trainId)}`);
    if (!resFallback.ok) throw new Error('Błąd API pobierania szczegółów pociągu');
    return await resFallback.json();
  }
  return await response.json();
}

function renderTrainDetails(data) {
  detailTrainName.textContent = data.trainName || data.name || `Pociąg ${activeTrainId}`;
  detailTrainNumber.textContent = data.trainNumber || data.number || activeTrainId;

  // Obecne opóźnienie na trasie wprost z API
  const totalDelay = data.totalDelay ?? data.delay ?? 0;
  if (totalDelay > 0) {
    detailTotalDelay.textContent = `Opóźnienie: +${totalDelay} min`;
    detailTotalDelay.className = 'total-delay-badge delayed';
  } else {
    detailTotalDelay.textContent = 'O czasie';
    detailTotalDelay.className = 'total-delay-badge on-time';
  }

  // Tabela / Lista Stacji (Trasa krok po kroku)
  routeTimeline.innerHTML = '';
  const stations = data.route || data.stations || data.stops || [];

  if (stations.length === 0) {
    routeTimeline.innerHTML = '<p>Brak dostępnych stacji na trasie.</p>';
    return;
  }

  stations.forEach((st) => {
    const item = document.createElement('div');

    // Status stacji: 'past' (miniona), 'current' (obecna), 'upcoming' (nadchodząca)
    const status = st.status || 'upcoming';
    item.className = `timeline-item status-${status}`;

    // Peron i Tor wprost z API
    const platform = st.platform ? `Peron ${st.platform}` : null;
    const track = st.track ? `Tor ${st.track}` : null;
    let platformTrackText = 'brak danych';
    if (platform && track) {
      platformTrackText = `${platform}, ${track}`;
    } else if (platform) {
      platformTrackText = platform;
    } else if (track) {
      platformTrackText = track;
    }

    let statusLabel = 'Nadchodząca';
    if (status === 'past') statusLabel = 'Miniona';
    if (status === 'current') statusLabel = 'Obecna stacja';

    const scheduledTime = st.scheduledTime || st.scheduled || '--:--';
    const actualTime = st.actualTime || st.actual || scheduledTime;
    const delay = st.delay ?? 0;
    const delayTag = delay > 0 ? `<span class="delay-tag delayed">+${delay} min</span>` : '';

    item.innerHTML = `
      <div class="timeline-marker"></div>
      <div class="station-card">
        <div class="station-header">
          <span class="station-name">${escapeHtml(st.stationName || st.name || st.station)}</span>
          <span class="station-status-badge">${statusLabel}</span>
        </div>
        <div class="station-details">
          <div class="station-times">
            <span>Rozkład: ${escapeHtml(scheduledTime)}</span>
            <span class="time-actual">Rzecz.: ${escapeHtml(actualTime)}</span>
            ${delayTag}
          </div>
          <div class="platform-track">${escapeHtml(platformTrackText)}</div>
        </div>
      </div>
    `;

    routeTimeline.appendChild(item);
  });
}

// ==========================================
// PŁYWAJĄCY PRZYCISK ODŚWIEŻANIA (FAB)
// ==========================================
async function handleFabRefresh() {
  fabRefresh.classList.add('spinning');

  try {
    if (listView.classList.contains('active')) {
      // Odświeżenie danych na liście monitorowanych pociągów
      for (let train of monitoredTrains) {
        try {
          const freshData = await fetchTrainDetailsFromAPI(train.id || train.number);
          train.delay = freshData.totalDelay ?? freshData.delay ?? 0;
          train.lastUpdate = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          
          dataCache.trainDetails[train.id || train.number] = {
            timestamp: Date.now(),
            data: freshData
          };
        } catch (e) {
          console.warn(`Nie udało się odświeżyć pociągu ${train.id}:`, e);
        }
      }
      saveMonitoredToStorage();
      renderMonitoredList();
    } else if (detailsView.classList.contains('active') && activeTrainId) {
      // Wymuszenie odświeżenia trasy z API (wymuszony parametr forceRefresh)
      await openTrainDetails(activeTrainId, true);
    }
  } finally {
    setTimeout(() => {
      fabRefresh.classList.remove('spinning');
    }, 600);
  }
}

// Autocomplete i pobieranie tablicy odjazdów
async function fetchStationSuggestions(query) {
  try {
    const res = await fetch(`/api/stations?query=${encodeURIComponent(query)}`);
    if (!res.ok) return;
    const stations = await res.json();

    autocompleteList.innerHTML = '';
    if (!Array.isArray(stations) || stations.length === 0) {
      autocompleteList.classList.add('hidden');
      return;
    }

    stations.slice(0, 8).forEach((st) => {
      const li = document.createElement('li');
      li.textContent = st.name || st;
      li.addEventListener('click', () => {
        stationInput.value = st.name || st;
        autocompleteList.classList.add('hidden');
        loadDeparturesForStation(st.name || st);
      });
      autocompleteList.appendChild(li);
    });

    autocompleteList.classList.remove('hidden');
  } catch (err) {
    console.error('Błąd wyszukiwania stacji:', err);
  }
}

async function loadDeparturesForStation(stationName) {
  departuresTitle.textContent = `Odjazdy ze stacji: ${stationName}`;
  departuresList.innerHTML = '<p class="loading-msg">Ładowanie odjazdów...</p>';
  departuresSection.classList.remove('hidden');

  try {
    const res = await fetch(`/api/departures?station=${encodeURIComponent(stationName)}`);
    if (!res.ok) throw new Error('Błąd odjazdów');
    const departures = await res.json();

    departuresList.innerHTML = '';
    if (!Array.isArray(departures) || departures.length === 0) {
      departuresList.innerHTML = '<p>Brak odjazdów w najbliższym czasie.</p>';
      return;
    }

    departures.forEach((dep) => {
      const item = document.createElement('div');
      item.className = 'departure-item';
      const isMonitored = monitoredTrains.some(t => (t.id || t.number) === (dep.id || dep.number));

      item.innerHTML = `
        <div>
          <strong>${escapeHtml(dep.name || dep.trainName)}</strong> (${escapeHtml(dep.number || dep.id)})
          <br/>
          <small>Kierunek: ${escapeHtml(dep.to || dep.destination)} | Odjazd: ${escapeHtml(dep.time || dep.scheduledTime)}</small>
        </div>
        <button class="btn-add" ${isMonitored ? 'disabled' : ''}>
          ${isMonitored ? 'Dodano' : '+ Dodaj'}
        </button>
      `;

      const addBtn = item.querySelector('.btn-add');
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addMonitoredTrain(dep);
        addBtn.disabled = true;
        addBtn.textContent = 'Dodano';
      });

      departuresList.appendChild(item);
    });
  } catch (err) {
    console.error('Błąd tablicy odjazdów:', err);
    departuresList.innerHTML = '<p class="error-msg">Nie udało się pobrać tablicy odjazdów.</p>';
  }
}

function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
