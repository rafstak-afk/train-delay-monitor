export async function loadTrain(train){

    const response = await fetch(
        `/api/train-details?train=${encodeURIComponent(train)}`
    );

    const data = await response.json();

    render(data);

}

function render(data){

    document.getElementById("category").textContent =
        data.category || "-";

    document.getElementById("trainName").textContent =
        data.name || "-";

    document.getElementById("trainNumber").textContent =
        `${data.category || ""} ${data.train || ""}`;

    document.getElementById("delay").textContent =
        `${data.delay ?? 0} min`;

    document.getElementById("currentPosition").innerHTML =
        `
        <h2>Bieżąca pozycja</h2>

        <p>${data.lastConfirmedStation ?? "-"}</p>

        <small>${data.lastConfirmedTime ?? "-"}</small>
        `;

    document.getElementById("timeline").innerHTML =
        (data.route || [])
        .map(station => `
            <div class="station">

                <strong>${station.stationName}</strong>

                <div>

                    ${station.plannedTime ?? ""}

                    ${station.actualTime ?? ""}

                </div>

            </div>
        `)
        .join("");

}
