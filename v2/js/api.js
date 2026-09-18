export async function loadTrain(train, params = {}) {
    const query = new URLSearchParams();
    query.set("train", train);
    
    if (params.station) query.set("station", params.station);
    if (params.time) query.set("time", params.time);
    if (params.date) query.set("date", params.date);

    // Krok 1: Wyszukiwanie identyfikatorów przez nowy inteligentny lookup v2
    let lookupData = null;
    try {
        const lookupRes = await fetch(`/api/v2/smart-lookup?${query.toString()}`);
        if (lookupRes.ok) {
            lookupData = await lookupRes.json();
        }
    } catch (e) {
        console.warn("Smart lookup v2 nie powiódł się, próbuję bezpośrednio", e);
    }

    // Krok 2: Pobieranie pełnego biegu pociągu z identyfikatorami z lookupu
    const detailsQuery = new URLSearchParams(query);
    if (lookupData && lookupData.ok) {
        if (lookupData.scheduleId) detailsQuery.set("scheduleId", lookupData.scheduleId);
        if (lookupData.orderId) detailsQuery.set("orderId", lookupData.orderId);
        if (lookupData.trainOrderId) detailsQuery.set("trainOrderId", lookupData.trainOrderId);
    }

    const response = await fetch(`/api/train-details?${detailsQuery.toString()}`);
    const data = await response.json();

    render(data);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function render(data) {
    if (!data || data.error) {
        document.getElementById("currentPosition").innerHTML = `
            <h2>Błąd</h2>
            <p>${escapeHtml(data?.error || "Nie udało się pobrać danych o biegu pociągu.")}</p>
        `;
        return;
    }

    document.getElementById("category").textContent = data.category || "-";
    document.getElementById("trainName").textContent = data.name || "-";
    document.getElementById("trainNumber").textContent = `${data.category || ""} ${data.train || ""}`;
    document.getElementById("delay").textContent = `${data.delay ?? 0} min`;

    document.getElementById("currentPosition").innerHTML = `
        <h2>Bieżąca pozycja</h2>
        <p>${escapeHtml(data.lastConfirmedStation ?? "-")}</p>
        <small>${escapeHtml(data.lastConfirmedTime ?? "-")}</small>
    `;

    document.getElementById("timeline").innerHTML = (data.route || [])
        .map(station => `
            <div class="station">
                <strong>${escapeHtml(station.stationName)}</strong>
                <div>
                    ${escapeHtml(station.plannedTime ?? "")}
                    ${escapeHtml(station.actualTime ?? "")}
                </div>
            </div>
        `)
        .join("");
}
