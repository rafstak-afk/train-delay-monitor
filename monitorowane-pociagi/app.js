/**
 * Monitorowane Pociągi - Core Logic z listą pociągów strategicznych
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minut cache

// Lista Twoich strategicznych pociągów
const STRATEGIC_TRAIN_IDS = [
  '3815', '40360', '38107', '40621', 
  '63102', '40450', '44226', '40250', 
  '40858', '40423', '40211', '40468'
];

// Stan aplikacji
const state = {
  monitoredTrainIds: JSON.parse(localStorage.getItem('monitored_trains')) || STRATEGIC_TRAIN_IDS,
  cache: {
    trainsData: null,
    lastFetchTime: 0,
    detailsCache: {}
  },
  activeTrainId: null
};

// Referencje DOM
const DOM = {
  monitoredView: document.getElementById('monitored-view'),
  detailsView: document.getElementById('details-view'),
  monitoredGrid: document.getElementById('monitored-grid'),
  cacheStatusText: document.getElementById('cache-status-text'),
  stationInput: document.getElementById('station-input'),
  autocompleteList: document.getElementById('autocomplete-results'),
  departuresPanel: document.getElementById('departures-panel'),
  selectedStationName: document.getElementById('selected-station-name'),
  departuresList: document.getElementById('departures-list'),
  btnCloseDepartures: document.getElementById('btn-close-departures'),
  btnBack: document.getElementById('btn-back'),
  fabRefresh: document.getElementById('fab-refresh'),
  
  // Widok Szczegółów
  trainTitle: document.getElementById('train-title'),
  trainDelayBadge: document.getElementById('train-delay-badge'),
  trainRouteSubtitle: document.getElementById('train-route-subtitle'),
  routeTimeline: document.getElementById('route-timeline')
};

// --- MOCK / FALLBACK DATA DLA POCIĄGÓW STRATEGICZNYCH ---
const STRATEGIC_MOCKS = {
  '3815': { id: '3815', number: 'KS 3815', name: '', origin: 'Katowice', destination: 'Zwardoń', delayMinutes: 0 },
  '40360': { id: '40360', number: 'KS 40360', name: '', origin: 'Bytom Karb', destination: 'Katowice', delayMinutes: 5 },
  '38107': { id: '38107', number: 'KS 38107', name: '', origin: 'Katowice', destination: 'Żywiec', delayMinutes: 0 },
  '40621': { id: '40621', number: 'KS 40621', name: '', origin: 'Katowice', destination: 'Gliwice', delayMinutes: 12 },
  '63102': { id: '63102', number: 'KS 63102', name: '', origin: 'Katowice', destination: 'Kraków Główny', delayMinutes: 0 },
  '40450': { id: '40450', number: 'KS 40450', name: '', origin: 'Tarnowskie Góry', destination: 'Katowice', delayMinutes: 2 },
  '44226': { id: '44226', number: 'KS 44226', name: '', origin: 'Miasteczko Śląskie', destination: 'Katowice', delayMinutes: 0 },
  '40250': { id: '40250', number: 'KS 40250', name: '', origin: 'Tarnowskie Góry', destination: 'Częstochowa', delayMinutes: 0 },
  '40858': { id: '40858', number: 'KS 40858', name: '', origin: 'Chorzów Batory', destination: 'Gliwice', delayMinutes: 0 },
  '40423': { id: '40423', number: 'KS 40423', name: '', origin: 'Chorzów Batory', destination: 'Tarnowskie Góry', delayMinutes: 18 },
  '40211': { id: '40211', number: 'KS 40211', name: '', origin: 'Chorzów Batory', destination: 'Katowice', delayMinutes: 0 },
  '40468': { id: '40468', number: 'KS 40468', name: '', origin: 'Chorzów Batory', destination: 'Katowice', delayMinutes: 0 }
};

// --- POBIERANIE DANYCH Z API LUB FALLBACK ---

async function apiFetchMonitoredTrains(ids) {
  try {
    const res = await fetch(`/api/monitored-trains?ids=${ids.join(',')}`);
    if (!res.ok) throw new Error('API Offline');
    return await res.json();
  } catch (err) {
    // Generowanie listy na podstawie danych strategicznych
    return ids.map(id => STRATEGIC_MOCKS[id] || {
      id: id,
      number: `Pociąg #${id}`,
      origin: 'Stacja Początkowa',
      destination: 'Stacja Docelowa',
      delayMinutes: 0
    });
  }
}

async function apiFetchTrainDetails(trainId) {
  try {
    const res = await fetch(`/api/trains/${trainId}`);
    if (!res.ok) throw new Error('API Offline');
    return await res.json();
  } catch (err) {
    const baseInfo = STRATEGIC_MOCKS[trainId] || { number: trainId, origin: 'Stacja A', destination: 'Stacja B', delayMinutes: 0 };
    return {
      ...baseInfo,
      stations: [
        { stationName: baseInfo.origin, platform: '1', track: '1', scheduledTime: '08:00', actualTime: '08:00', delay: 0 },
        { stationName: 'Stacja Pośrednia', platform: '2', track: '1', scheduledTime: '08:20', actualTime: baseInfo.delayMinutes > 0 ? `08:${20 + baseInfo.delayMinutes}` : '08:20', delay: baseInfo.delayMinutes },
        { stationName: baseInfo.destination, platform: '1', track: '2', scheduledTime: '08:45', actualTime: baseInfo.delayMinutes > 0 ? `08:${45 + baseInfo.delayMinutes}` : '08:45', delay: baseInfo.delayMinutes }
      ]
    };
  }
}

async function apiSearchStations(query) {
  try {
    const res = await fetch(`/api/stations?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('API Offline');
    return await res.json();
  } catch (err) {
    const list = ['Katowice', 'Bytom Karb', 'Tarnowskie Góry', 'Miasteczko Śląskie', 'Chorzów Batory'];
    return list.filter(s => s.toLowerCase().includes(query.toLowerCase())).map((name, i) => ({ id: `st_${i}`, name }));
  }
}

async function apiFetchDepartures(stationId) {
  try {
    const res = await fetch(`/api/departures?stationId=${encodeURIComponent(stationId)}`);
    if (!res.ok) throw new Error('API Offline');
    return await res.json();
  } catch (err) {
    return [
      { trainId: '3815', trainNumber: 'KS 3815', destination: 'Zwardoń', scheduledTime: '14:15' },
      { trainId: '40621', trainNumber: 'KS 40621', destination: 'Gliwice', scheduledTime: '14:40' }
    ];
  }
}

// --- LOGIKA PAMIĘCI PODRĘCZNEJ (CACHE 5 MIN) ---

async function loadMonitoredTrains(forceRefresh = false) {
  const now = Date.now();
  const isCacheValid = (now - state.cache.lastFetchTime) < CACHE_TTL_MS;

  if (!forceRefresh && isCacheValid && state.cache.trainsData) {
    renderMonitoredGrid(state.cache.trainsData);
    return;
  }

  DOM.fabRefresh.classList.add('spinning');
  try {
    const data = await apiFetchMonitoredTrains(state.monitoredTrainIds);
    state.cache.trainsData = data;
    state.cache.lastFetchTime = now;
    
    const timeStr = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    DOM.cacheStatusText.textContent = `Ostatnia aktualizacja: ${timeStr}`;
    
    renderMonitoredGrid(data);
  } catch (err) {
    console.error('Błąd ładowania:', err);
  } finally {
    DOM.fabRefresh.classList.remove('spinning');
  }
}

async function loadTrainDetails(trainId, forceRefresh = false) {
  const now = Date.now();
  const cached = state.cache.detailsCache[trainId];
  const isCacheValid = cached && (now - cached.timestamp < CACHE_TTL_MS);

  if (!forceRefresh && isCacheValid) {
    renderDetailsView(cached.data);
    showView('details');
    return;
  }

  DOM.fabRefresh.classList.add('spinning');
  try {
    const data = await apiFetchTrainDetails(trainId);
    state.cache.detailsCache[trainId] = { timestamp: now, data };
    renderDetailsView(data);
    showView('details');
  } catch (err) {
    console.error('Błąd ładowania szczegółów:', err);
  } finally {
    DOM.fabRefresh.classList.remove('spinning');
  }
}

// --- RENDEROWANIE WIDOKÓW ---

function renderMonitoredGrid(trains) {
  DOM.monitoredGrid.innerHTML = '';

  if (!trains || !trains.length) {
    DOM.monitoredGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #666;">Brak monitorowanych pociągów. Dodaj pociąg przy użyciu wyszukiwarki powyżej.</p>';
    return;
  }

  trains.forEach(train => {
    const card = document.createElement('div');
    card.className = 'train-card';
    
    let badgeClass = 'on-time';
    if (train.delayMinutes > 2 && train.delayMinutes < 15) badgeClass = 'delay-low';
    if (train.delayMinutes >= 15) badgeClass = 'delay-high';

    card.innerHTML = `
      <div class="card-header">
        <span class="train-number">${train.number} ${train.name || ''}</span>
        <button class="btn-delete" title="Usuń z monitorowanych">🗑️</button>
      </div>
      <div class="card-body">
        <p class="route">${train.origin} ➔ ${train.destination}</p>
        <span class="badge ${badgeClass}">
          ${train.delayMinutes > 0 ? `+${train.delayMinutes} min` : 'O czasie'}
        </span>
      </div>
    `;

    // 1. KLIKNIĘCIE W CAŁY KAFELEK -> BIEG POCIĄGU
    card.addEventListener('click', () => {
      state.activeTrainId = train.id;
      loadTrainDetails(train.id);
    });

    // 2. KLIKNIĘCIE W KOSZ -> TYLKO USUWANIE (e.stopPropagation)
    const btnDelete = card.querySelector('.btn-delete');
    btnDelete.addEventListener('click', (e) => {
      e.stopPropagation();
      removeTrainFromMonitoring(train.id);
    });

    DOM.monitoredGrid.appendChild(card);
  });
}

function renderDetailsView(data) {
  DOM.trainTitle.textContent = `${data.number} ${data.name || ''}`;
  DOM.trainRouteSubtitle.textContent = `${data.origin} ➔ ${data.destination}`;
  
  DOM.trainDelayBadge.textContent = data.delayMinutes > 0 ? `+${data.delayMinutes} min opóźnienia` : 'O czasie';
  DOM.trainDelayBadge.className = `badge ${data.delayMinutes > 0 ? 'delay-high' : 'on-time'}`;

  DOM.routeTimeline.innerHTML = '';

  data.stations.forEach(st => {
    const row = document.createElement('div');
    row.className = 'timeline-row';

    row.innerHTML = `
      <div class="station-info">
        <div class="name">${st.stationName}</div>
        <div class="platform">Peron: ${st.platform || '--'} / Tor: ${st.track || '--'}</div>
      </div>
      <div class="delay-info">
        <span class="badge ${st.delay > 0 ? 'delay-low' : 'on-time'}">
          ${st.delay > 0 ? `+${st.delay} min` : '0 min'}
        </span>
      </div>
      <div class="time-box">
        ${st.delay > 0 ? `<div class="scheduled">${st.scheduledTime}</div>` : ''}
        <div class="actual">${st.actualTime}</div>
      </div>
    `;

    DOM.routeTimeline.appendChild(row);
  });
}

// --- AKCJE ZARZĄDZANIA STANEM ---

function addTrainToMonitoring(train) {
  if (!state.monitoredTrainIds.includes(train.id)) {
    state.monitoredTrainIds.push(train.id);
    saveState();
    loadMonitoredTrains(true);
  }
}

function removeTrainFromMonitoring(trainId) {
  state.monitoredTrainIds = state.monitoredTrainIds.filter(id => id !== trainId);
  saveState();
  
  if (state.cache.trainsData) {
    state.cache.trainsData = state.cache.trainsData.filter(t => t.id !== trainId);
  }
  renderMonitoredGrid(state.cache.trainsData || []);
}

function saveState() {
  localStorage.setItem('monitored_trains', JSON.stringify(state.monitoredTrainIds));
}

function showView(viewName) {
  if (viewName === 'details') {
    DOM.monitoredView.classList.remove('active');
    DOM.monitoredView.classList.add('hidden');
    DOM.detailsView.classList.remove('hidden');
    DOM.detailsView.classList.add('active');
  } else {
    DOM.detailsView.classList.remove('active');
    DOM.detailsView.classList.add('hidden');
    DOM.monitoredView.classList.remove('hidden');
    DOM.monitoredView.classList.add('active');
    state.activeTrainId = null;
  }
}

// --- OBSŁUGA ZDARZEŃ ---

DOM.btnBack.addEventListener('click', () => {
  showView('monitored');
  loadMonitoredTrains(false);
});

DOM.fabRefresh.addEventListener('click', () => {
  if (DOM.detailsView.classList.contains('active') && state.activeTrainId) {
    loadTrainDetails(state.activeTrainId, true);
  } else {
    loadMonitoredTrains(true);
  }
});

DOM.stationInput.addEventListener('input', async (e) => {
  const query = e.target.value.trim();
  if (query.length < 2) {
    DOM.autocompleteList.classList.add('hidden');
    return;
  }

  try {
    const stations = await apiSearchStations(query);
    DOM.autocompleteList.innerHTML = '';
    
    stations.forEach(st => {
      const li = document.createElement('li');
      li.textContent = st.name;
      li.addEventListener('click', () => {
        DOM.stationInput.value = st.name;
        DOM.autocompleteList.classList.add('hidden');
        openDeparturesPanel(st);
      });
      DOM.autocompleteList.appendChild(li);
    });
    
    DOM.autocompleteList.classList.remove('hidden');
  } catch (err) {
    console.error(err);
  }
});

async function openDeparturesPanel(station) {
  DOM.selectedStationName.textContent = station.name;
  DOM.departuresPanel.classList.remove('hidden');
  DOM.departuresList.innerHTML = 'Ładowanie odjazdów...';

  try {
    const departures = await apiFetchDepartures(station.id);
    DOM.departuresList.innerHTML = '';

    departures.forEach(dep => {
      const li = document.createElement('li');
      li.className = 'departure-item';
      
      const isAlreadyMonitored = state.monitoredTrainIds.includes(dep.trainId);

      li.innerHTML = `
        <div>
          <strong>${dep.scheduledTime}</strong> - ${dep.trainNumber} do ${dep.destination}
        </div>
        <button class="btn-add" ${isAlreadyMonitored ? 'disabled' : ''}>
          ${isAlreadyMonitored ? '✓ Dodano' : '+ Dodaj'}
        </button>
      `;

      const btnAdd = li.querySelector('.btn-add');
      btnAdd.addEventListener('click', () => {
        addTrainToMonitoring({ id: dep.trainId });
        btnAdd.textContent = '✓ Dodano';
        btnAdd.disabled = true;
      });

      DOM.departuresList.appendChild(li);
    });
  } catch (err) {
    DOM.departuresList.innerHTML = 'Błąd pobierania tablicy odjazdów.';
  }
}

DOM.btnCloseDepartures.addEventListener('click', () => {
  DOM.departuresPanel.classList.add('hidden');
});

// Start
document.addEventListener('DOMContentLoaded', () => {
  // Przeczyść stary, pusty cache jeśli istniał
  if (!localStorage.getItem('monitored_trains')) {
    saveState();
  }
  loadMonitoredTrains(false);
});
