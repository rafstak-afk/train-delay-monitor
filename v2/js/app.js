import { loadTrain } from "./api.js";

const params = new URLSearchParams(location.search);

const train = params.get("train");

if (train) {

    loadTrain(train);

}
