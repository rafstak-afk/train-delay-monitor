import { loadTrain } from "./api.js";

const params = new URLSearchParams(location.search);
const train = params.get("train");

if (train) {
    const station = params.get("station") || params.get("stationId") || "";
    const time = params.get("time") || "";
    const date = params.get("date") || "";

    loadTrain(train, { station, time, date });
}
