@rafstak-afk ➜ /workspaces/train-delay-monitor (main) $ curl "https://train-delay-monitor1.pages.dev/api/debug-train?date=2026-07-15&scheduleId=2026&orderId=960484455&trainOrderId=316600533" | head -120
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
100 39326  100 39326    0     0  15063      0  0:00:02  0:00:02 --:--:-- 15067
{
  "foundRoute": true,
  "foundOperation": true,
  "routeStationsCount": 24,
  "operationStationsCount": 24,
  "routeStations": [
    {
      "stationId": 55806,
      "orderNumber": 1,
      "departureCommercialCategory": "TLK",
      "departureTrainNumber": "63102",
      "departurePlatform": "2",
      "departureTrack": "2",
      "departureTime": "05:58:00"
    },
    {
      "stationId": 55632,
      "orderNumber": 5,
      "arrivalCommercialCategory": "TLK",
      "arrivalTrainNumber": "63102",
      "arrivalTime": "06:19:30",
      "departureCommercialCategory": "TLK",
      "departureTrainNumber": "63102",
      "departurePlatform": "1",
      "departureTrack": "2",
      "departureTime": "06:20:30"
    },
    {
      "stationId": 55103,
      "orderNumber": 9,
      "arrivalCommercialCategory": "TLK",
      "arrivalTrainNumber": "63102",
      "arrivalTime": "06:43:00",
      "departureCommercialCategory": "TLK",
      "departureTrainNumber": "63102",
      "departurePlatform": "2",
      "departureTrack": "2",
      "departureTime": "06:44:00"
    },
    {
      "stationId": 54551,
      "orderNumber": 11,
      "arrivalCommercialCategory": "TLK",
      "arrivalTrainNumber": "63102",
      "arrivalTime": "06:52:00",
      "departureCommercialCategory": "TLK",
      "departureTrainNumber": "63102",
      "departurePlatform": "2",
      "departureTrack": "2",
      "departureTime": "06:53:00"
    },
    {
      "stationId": 54528,
      "orderNumber": 13,
      "arrivalCommercialCategory": "TLK",
      "arrivalTrainNumber": "63102",
      "arrivalTime": "07:05:30",
      "departureCommercialCategory": "TLK",
      "departureTrainNumber": "63102",
      "departurePlatform": "2",
      "departureTrack": "2",
      "departureTime": "07:06:30"
    },
    {
      "stationId": 54403,
      "orderNumber": 14,
      "arrivalCommercialCategory": "TLK",
      "arrivalTrainNumber": "63102",
      "arrivalTime": "07:13:30",
      "departureCommercialCategory": "TLK",
      "departureTrainNumber": "63102",
      "departurePlatform": "1",
      "departureTrack": "10",
      "departureTime": "07:14:30"
    },
    {
      "stationId": 54817,
      "orderNumber": 15,
      "arrivalCommercialCategory": "TLK",
      "arrivalTrainNumber": "63102",
      "arrivalTime": "07:26:00",
      "departureCommercialCategory": "TLK",
      "departureTrainNumber": "63102",
      "departurePlatform": "2",
      "departureTrack": "2",
      "departureTime": "07:31:00"
    },
    {
      "stationId": 54908,
      "orderNumber": 18,
      "arrivalCommercialCategory": "TLK",
      "arrivalTrainNumber": "63102",
      "arrivalTime": "07:51:00",
      "departureCommercialCategory": "TLK",
      "departureTrainNumber": "63102",
      "departurePlatform": "2",
      "departureTrack": "2",
      "departureTime": "07:52:00"
    },
    {
      "stationId": 57703,
      "orderNumber": 21,
      "arrivalCommercialCategory": "TLK",
      "arrivalTrainNumber": "63102",
      "arrivalTime": "08:17:00",
      "departureCommercialCategory": "TLK",
      "departureTrainNumber": "63102",
      "departurePlatform": "1",
      "departureTrack": "2",
      "departureTime": "08:18:00"
    },
    {
      "stationId": 56408,
      "orderNumber": 22,
      "arrivalCommercialCategory": "TLK",
      "arrivalTrainNumber": "63102",
      "arrivalTime": "08:31:00",
      "departureCommercialCategory": "TLK",
      "departureTrainNumber": "63102",
      "departurePlatform": "3",
@rafstak-afk ➜ /workspaces/train-delay-monitor (main) $ 
