/**
 * Application Core Logic & State Management
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minut cache

// Stan aplikacji
const state = {
  monitoredTrainIds: JSON.parse(localStorage.getItem('monitored_trains')) || ['IC13100', 'KM91234'],
  cache: {
    trainsData: null,
    lastFetchTime: 0,
    detailsCache: {} // trainId -> { timestamp, data }
  },
  activeTrainId: null
};

// Referencje do elementów DOM
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

// --- MOCK DATA (Zapewnia działanie nawet gdy brak fizycznego API) ---
const MOCK_DATA = {
  trains: [
    { id: 'IC13100', number: 'IC 13100', name: 'Mazovia', origin: 'Warszawa Centralna', destination: 'Kraków Główny', delayMinutes: 12 },
    { id: 'KM91234', number: 'KM 91234', name: '', origin: 'Skierniewice', destination: 'Warszawa Wschodnia', delayMinutes: 0 },
    { id: 'TLK35100', number: 'TLK 35100', name: 'Słoneczny', origin: 'Gdynia Główna', destination: 'Zakopane', delayMinutes: 25 }
  ],
  details: {
    'IC13100': {
      id: 'IC13100',
      number: 'IC 13100',
      name: 'Mazovia',
      origin: 'Warszawa Centralna',
      destination: 'Kraków Główny',
      delayMinutes: 12,
      stations: [
        { stationName: 'Warszawa Centralna', platform: '3', track: '2', scheduledTime: '14:25', actualTime: '14:25', delay: 0 },
        { stationName: 'Warszawa Zachodnia', platform: '2', track: '1', scheduledTime: '14:30', actualTime: '14:32', delay: 2 },
        { stationName: 'Radom Główny', platform: '1', track: '1', scheduledTime: '15:40', actualTime: '15:52', delay: 12 },
        { stationName: 'Kielce Główna', platform: '2', track: '4', scheduledTime: '16:45', actualTime: '16:57', delay: 12 },
        { stationName: 'Kraków Główny', platform: '4', track: '2', scheduledTime: '18:10', actualTime: '18:22', delay: 12 }
      ]
    },
    'KM91234': {
      id: 'KM91234',
      number: 'KM 91234',
      name: '',
      origin: 'Skierniewice',
      destination: 'Warszawa Wschodnia',
      delayMinutes: 0,
      stations: [
        { stationName: 'Skierniewice', platform: '1', track: '2', scheduledTime: '07:10', actualTime: '07:10', delay: 0 },
        { stationName: 'Żyrardów', platform: '2', track: '1', scheduledTime: '07:25', actualTime: '07:25', delay: 0 },
        { stationName: 'Warszawa Zachodnia', platform: '4', track: '3', scheduledTime: '08:02', actualTime: '08:02', delay: 0 },
        { stationName: 'Warszawa Centralna', platform: '2', track: '1', scheduledTime: '08:08', actualTime: '08:08', delay: 0 },
        { stationName: 'Warszawa Wschodnia', platform: '3', track: '5', scheduledTime: '08:15', actualTime: '08:15', delay: 0 }
      ]
    }
  }
};

// --- API FETCHERS (Pobierają z serwera, a w razie błędu zwracają MOCK) ---

async function apiFetchMonitoredTrains(ids) {
  try {
    const res = await fetch(`/api/monitored-trains?ids=${ids.join(',')}`);
    if (!res.ok) throw new Error('API Unavailable');
    return await res.json();
  } catch (err) {
    // Fallback do Mock Data
    return MOCK_DATA.trains.filter(t => ids.includes(t.id));
  }
}

async function apiFetchTrainDetails(trainId) {
  try {
    const res = await fetch(`/api/trains/${trainId}`);
    if (!res.ok) throw new Error('API Unavailable');
    return await res.json();
  } catch (err) {
    // Fallback do Mock Data
    if (MOCK_DATA.details[trainId]) return MOCK_DATA.details[trainId];
    return {
      id: trainId,
      number: trainId,
      name: 'Pociąg Testowy',
      origin: 'Stacja A',
      destination: 'Stacja B',
      delayMinutes: 5,
      stations: [
        { stationName: 'Stacja Początkowa', platform: '1', track: '1', scheduledTime: '12:00', actualTime: '12:00', delay: 0 },
        { stationName: 'Stacja Końcowa', platform: '2', track: '1', scheduledTime: '13:00', actualTime: '13:05', delay: 5 }
      ]
    };
  }
}

async function apiSearchStations(query) {
  try {
    const res = await fetch(`/api/stations?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('API Unavailable');
    return await res.json();
  } catch (err) {
    const list = ['Warszawa Centralna', 'Kraków Główny', 'Katowice', 'Poznań Główny', 'Gdańsk Główny'];
    return list.filter(s => s.toLowerCase().includes(query.toLowerCase())).map((name, i) => ({ id: `st_${i}`, name }));
  }
}

async function apiFetchDepartures(stationId) {
  try {
    const res = await fetch(`/api/departures?stationId=${encodeURIComponent(stationId)}`);
    if (!res.ok) throw new Error('API Unavailable');
    return await res.json();
  } catch (err) {
    return [
      { trainId: 'TLK35100', trainNumber: 'TLK 35100', destination: 'Zakopane', scheduledTime: '15:10' },
      { trainId: 'IC13100', trainNumber: 'IC 13100', destination: 'Kraków Główny', scheduledTime: '15:35' }
    ];
  }
}

// --- ZARZĄDZANIE PAMIĘCIĄ PODRĘCZNĄ I DANYMI ---

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
    console.error('Błąd ładowania pociągów:', err);
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

    // Kliknięcie w cały kafel -> Otwiera Bieg Pociągu
    card.addEventListener('click', () => {
      state.activeTrainId = train.id;
      loadTrainDetails(train.id);
    });

    // Przycisk usuwania -> Zatrzymanie propagacji zdarzenia!
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

// --- AKCJE I PRZEŁĄCZANIE WIDOKÓW ---

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

// --- OBSŁUGA INTERAKCJI ---

// Powrót do widoku monitorowania (wykorzystuje cache jeśli jest ważny)
DOM.btnBack.addEventListener('click', () => {
  showView('monitored');
  loadMonitoredTrains(false);
});

// Pływający Przycisk Odświeżania (FAB) -> Wymusza pobranie świeżych danych
DOM.fabRefresh.addEventListener('click', () => {
  if (DOM.detailsView.classList.contains('active') && state.activeTrainId) {
    loadTrainDetails(state.activeTrainId, true);
  } else {
    loadMonitoredTrains(true);
  }
});

// Autocomplete dla wyszukiwarki stacji
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

// Uruchomienie przy starcie
document.addEventListener('DOMContentLoaded', () => {
  loadMonitoredTrains(false);
});
