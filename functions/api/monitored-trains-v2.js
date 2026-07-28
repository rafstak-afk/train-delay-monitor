<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tablica Monitorowania Pociągów</title>
    <style>
        :root {
            --bg-main: #0a0e17;
            --panel-bg: #111827;
            --panel-border: #1f293d;
            --text-main: #f3f4f6;
            --text-muted: #9ca3af;
            --accent-green: #10b981;
            --accent-blue: #2563eb;
            --status-delay-bg: rgba(239, 68, 68, 0.15);
            --status-delay-text: #f87171;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        body {
            background-color: var(--bg-main);
            color: var(--text-main);
            padding: 16px;
            max-width: 960px;
            margin: 0 auto;
            font-size: 14px;
        }

        header {
            margin-bottom: 20px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
        }

        h1 {
            font-size: 1.4rem;
            font-weight: 800;
            color: #ffffff;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .header-controls {
            display: flex;
            gap: 8px;
        }

        .btn-sm {
            background: #1f293d;
            border: 1px solid #374151;
            color: #ffffff;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 0.85rem;
            font-weight: 700;
            cursor: pointer;
        }

        .btn-sm:hover { background: #374151; }

        .system-status-bar {
            width: 100%;
            background: rgba(16, 185, 129, 0.1);
            border: 1px solid var(--accent-green);
            color: #34d399;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 0.85rem;
            font-weight: 700;
            margin-bottom: 16px;
            display: flex;
            justify-content: space-between;
        }

        .system-status-bar.alert {
            background: var(--status-delay-bg);
            border-color: #ef4444;
            color: var(--status-delay-text);
        }

        /* LISTA POCIĄGÓW (REKORDY TABLICY) */
        .board-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .board-record-card {
            background: #0f172a;
            border: 1px solid var(--panel-border);
            border-radius: 8px;
            padding: 12px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            text-decoration: none;
            color: inherit;
            transition: border-color 0.15s, background-color 0.15s;
        }

        .board-record-card:hover {
            border-color: var(--accent-blue);
            background: #1e293b;
        }

        .board-left {
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .station-status-big {
            display: flex;
            flex-direction: column;
            min-width: 110px;
        }

        .station-status-big .city {
            font-size: 0.95rem;
            font-weight: 700;
            color: #ffffff;
        }

        .station-status-big .delay-num {
            font-size: 1.8rem;
            font-weight: 900;
            line-height: 1;
            margin-top: 2px;
        }

        .delay-num.ok { color: var(--accent-green); }
        .delay-num.delayed { color: #f87171; }

        .time-group {
            display: flex;
            flex-direction: column;
            min-width: 80px;
        }

        .time-group .time-main {
            font-size: 1.3rem;
            font-weight: 800;
            color: var(--accent-green);
        }

        .time-group .time-sub {
            font-size: 0.8rem;
            color: #60a5fa;
            font-weight: 600;
        }

        .board-right {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            text-align: right;
            gap: 3px;
        }

        .train-header-line {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .tag-category {
            background: #7c2d12;
            color: #fdba74;
            font-style: italic;
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 0.75rem;
            font-weight: 700;
        }

        .train-name-title {
            font-size: 1.1rem;
            font-weight: 800;
            color: #ffffff;
        }

        .dest-title {
            font-size: 0.95rem;
            font-weight: 700;
            color: #ffffff;
        }

        .via-line, .details-line {
            font-size: 0.8rem;
            color: var(--text-muted);
        }

        @media (max-width: 650px) {
            .board-record-card {
                flex-direction: column;
                align-items: flex-start;
            }
            .board-right {
                align-items: flex-start;
                text-align: left;
                width: 100%;
                border-top: 1px solid var(--panel-border);
                padding-top: 8px;
            }
        }
    </style>
</head>
<body>

    <header>
        <h1>🖥️ Tablica Monitorowania</h1>
        <div class="header-controls">
            <button class="btn-sm" id="btnNotify" onclick="requestNotificationPermission()">🔔 Alerty</button>
            <button class="btn-sm" onclick="fetchMonitoredTrains(true)">🔄 Odśwież</button>
        </div>
        <div class="system-status-bar" id="statusBar">
            <span>Stan systemu: Pobieranie danych...</span>
            <span id="updateTime">--:--:--</span>
        </div>
    </header>

    <main class="board-list" id="boardContainer">
        <div style="text-align:center; padding: 40px; color: var(--text-muted);">
            Ładowanie listy monitorowanych pociągów...
        </div>
    </main>

    <script>
        const CACHE_KEY = 'monitored_trains_cache';

        async function fetchMonitoredTrains(force = false) {
            const container = document.getElementById('boardContainer');
            const statusEl = document.getElementById('statusBar');
            const updateTimeEl = document.getElementById('updateTime');

            try {
                const res = await fetch('/api/monitored-trains-v2');
                if (!res.ok) throw new Error("API Błąd");

                const data = await res.json();
                localStorage.setItem(CACHE_KEY, JSON.stringify({ time: Date.now(), data }));
                renderBoard(data, false);
            } catch (err) {
                const cached = localStorage.getItem(CACHE_KEY);
                if (cached) {
                    const { time, data } = JSON.parse(cached);
                    renderBoard(data, true, new Date(time));
                } else {
                    statusEl.className = 'system-status-bar alert';
                    statusEl.innerHTML = '<span>⚠️ BŁĄD POŁĄCZENIA Z SERWEREM PKP PLK</span>';
                    container.innerHTML = '<div style="text-align:center; padding:30px; color:#f87171;">Brak połączenia oraz braki w pamięci podręcznej.</div>';
                }
            }
        }

        function renderBoard(data, isOffline = false, offlineTime = null) {
            const container = document.getElementById('boardContainer');
            const statusEl = document.getElementById('statusBar');
            const updateTimeEl = document.getElementById('updateTime');

            const trains = data.trains || [];
            const now = offlineTime || new Date();
            updateTimeEl.innerText = now.toTimeString().split(' ')[0] + (isOffline ? ' (OFFLINE)' : '');

            if (isOffline) {
                statusEl.className = 'system-status-bar alert';
                statusEl.children[0].innerText = '⚠️ AWARIA API PLK – Wyświetlam zapisane dane';
            } else {
                statusEl.className = 'system-status-bar';
                statusEl.children[0].innerText = `✓ Połączono z PLK. Monitorowane pozycje: ${data.foundCount || trains.length}`;
            }

            container.innerHTML = trains.map(t => {
                const delay = Number(t.delay || 0);
                const delayClass = delay > 0 ? 'delayed' : 'ok';
                const timeStr = t.time && t.time !== '--:--' ? t.time : (t.plannedTime || '--:--');
                const targetUrl = `train.html?train=${encodeURIComponent(t.train)}&station=${encodeURIComponent(t.station)}`;

                return `
                    <a href="${targetUrl}" class="board-record-card">
                        <div class="board-left">
                            <div class="station-status-big">
                                <span class="city">${t.station}</span>
                                <span class="delay-num ${delayClass}">${delay}</span>
                            </div>
                            <div class="time-group">
                                <span class="time-main">${timeStr}</span>
                                <span class="time-sub">${t.found ? 'odjazd' : 'brak info'}</span>
                            </div>
                        </div>
                        <div class="board-right">
                            <div class="train-header-line">
                                <span class="tag-category">${t.category || 'IC'}</span>
                                <span class="train-name-title">${t.train} ${t.name || ''}</span>
                            </div>
                            <div class="dest-title">${t.destination || 'Brak danych'}</div>
                            ${t.via ? `<div class="via-line">przez: ${t.via}</div>` : ''}
                            <div class="details-line">peron ${t.platform || '-'} · tor ${t.track || '-'}</div>
                        </div>
                    </a>
                `;
            }).join('');
        }

        fetchMonitoredTrains();
        setInterval(fetchMonitoredTrains, 60000);
    </script>
</body>
</html>
