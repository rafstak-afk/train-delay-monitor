interface Env {
  PDP_API_KEY: string;
}

const PLK_BASE = 'https://pdp-api.plk-sa.pl/api/v1';

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function arrifyPayload(data: any): any[] {
  if (Array.isArray(data)) return data;
  return data?.trains ||
    data?.items ||
    data?.content ||
    data?.data ||
    data?.operations ||
    [];
}

function validCourseId(value: any): string {
  return String(value ?? '').trim();
}

function trainNumberMatches(item: any, trainNo: string): boolean {
  const wanted = String(trainNo || '').trim();
  if (!wanted) return false;

  const candidates = [
    item.trainNumber,
    item.commercialTrainNumber,
    item.nationalNumber,
    item.tn,
    item.arrivalTrainNumber,
    item.departureTrainNumber,
    item.number,
    item.trainNo
  ];

  return candidates.some(
    v => String(v ?? '').trim() === wanted
  );
}

function pickTrainIds(item: any) {
  return {
    scheduleId: validCourseId(item.scheduleId ?? item.sid),
    orderId: validCourseId(item.orderId ?? item.oid),
    trainOrderId: validCourseId(item.trainOrderId ?? item.toid),
    operatingDate:
      item.operatingDate ??
      item.date ??
      item.runDate
  };
}

async function plkGet(
  path: string,
  apiKey: string
): Promise<any> {
  const res = await fetch(PLK_BASE + path, {
    headers: {
      'X-API-Key': apiKey,
      'Accept': 'application/json'
    }
  });

  if (!res.ok) {
    throw new Error('PLK HTTP ' + res.status);
  }

  return res.json();
}

function normalizeTrainNumber(value: any): string {
  const s = String(value ?? '').trim();
  if (!s) return '';
  return s.replace(/^0+(?=\d)/, '');
}

function scheduleTrainNumberMatches(
  route: any,
  trainNo: string
): boolean {
  const wanted = normalizeTrainNumber(trainNo);
  if (!wanted) return false;

  const candidates = [
    route.nationalNumber,
    route.trainNumber,
    route.commercialTrainNumber,
    route.tn,
    route.number,
    ...(Array.isArray(route.stations)
      ? route.stations.flatMap((s: any) => [
          s.arrivalTrainNumber,
          s.departureTrainNumber
        ])
      : [])
  ];

  return candidates.some(
    v => normalizeTrainNumber(v) === wanted
  );
}

async function resolveTrainIdsFromSchedules(
  {
    trainNo,
    stationId,
    operatingDate
  }: {
    trainNo: string;
    stationId: string;
    operatingDate: string;
  },
  apiKey: string
) {
  if (!trainNo) {
    throw new Error('Brak numeru pociągu do resolvera');
  }

  if (!stationId) {
    throw new Error('Brak stationId do resolvera pociągu');
  }

  const qs = new URLSearchParams({
    dateFrom: operatingDate,
    dateTo: operatingDate,
    stations: String(stationId)
  });

  const data = await plkGet(
    '/schedules?' + qs.toString(),
    apiKey
  );

  const routes = Array.isArray(data?.routes)
    ? data.routes
    : arrifyPayload(data);

  const matches = routes.filter(
    (route: any) =>
      Array.isArray(route.stations) &&
      route.stations.some(
        (s: any) =>
          Number(s.stationId) === Number(stationId)
      ) &&
      scheduleTrainNumberMatches(route, trainNo)
  );

  if (!matches.length) {
    throw new Error(
      'Nie znaleziono pociągu ' +
      trainNo +
      ' dla stacji ' +
      stationId +
      ' w rozkładzie na ' +
      operatingDate
    );
  }

  if (matches.length > 1) {
    throw new Error(
      'Znaleziono więcej niż jeden kurs pociągu ' +
      trainNo +
      ' dla stacji ' +
      stationId +
      ' na ' +
      operatingDate
    );
  }

  const found = matches[0];

  const ids = pickTrainIds(found);

  if (!ids.scheduleId || !ids.orderId) {
    throw new Error(
      'Znaleziono pociąg, ale bez scheduleId/orderId'
    );
  }

  return {
    ...ids,
    operatingDate:
      ids.operatingDate || operatingDate,
    resolverSource: 'schedules',
    resolverStationId: stationId,
    resolverMatchedTrain: found
  };
}

async function handleTrainRoute(
  url: URL,
  apiKey: string
): Promise<Response> {
  let scheduleId = validCourseId(
    url.searchParams.get('scheduleId')
  );

  let orderId = validCourseId(
    url.searchParams.get('orderId')
  );

  let trainOrderId = validCourseId(
    url.searchParams.get('trainOrderId')
  );

  const train =
    url.searchParams.get('train') || '';

  const stationId =
    url.searchParams.get('stationId') || '';

  const station =
    url.searchParams.get('station') || '';

  let operatingDate =
    url.searchParams.get('operatingDate') ||
    url.searchParams.get('date') ||
    new Date().toLocaleDateString(
      'sv-SE',
      { timeZone: 'Europe/Warsaw' }
    );

  const result: any = {
    ok: true,
    source: 'PDP API PLK',
    train,
    stationId,
    station,
    scheduleId,
    orderId,
    trainOrderId,
    operatingDate,
    resolvedBy:
      scheduleId && orderId
        ? 'query-identifiers'
        : null,
    foundRoute: false,
    foundOperation: false,
    route: null,
    operation: null,
    errors: {}
  };

  if (!scheduleId || !orderId) {
    try {
      const resolved =
        await resolveTrainIdsFromSchedules(
          {
            trainNo: train,
            stationId,
            operatingDate
          },
          apiKey
        );

      scheduleId = String(resolved.scheduleId);
      orderId = String(resolved.orderId);

      trainOrderId = String(
        resolved.trainOrderId ||
        trainOrderId ||
        ''
      );

      operatingDate = String(
        resolved.operatingDate ||
        operatingDate
      );

      Object.assign(result, {
        scheduleId,
        orderId,
        trainOrderId,
        operatingDate,
        resolvedBy:
          resolved.resolverSource,
        resolverStationId:
          resolved.resolverStationId,
        resolverMatchedTrain:
          resolved.resolverMatchedTrain
      });
    } catch (e: any) {
      return json({
        ok: false,
        error:
          'Nie udało się ustalić scheduleId/orderId dla pociągu',
        details: e?.message || String(e),
        hint:
          'Najpewniejsze wejście: klik numer pociągu z tablicy, wtedy rekord niesie scheduleId i orderId. Alternatywnie podaj stationId.',
        train,
        stationId,
        station,
        operatingDate
      }, 400);
    }
  }

  try {
    const route = await plkGet(
      '/schedules/route/' +
      encodeURIComponent(scheduleId) +
      '/' +
      encodeURIComponent(orderId),
      apiKey
    );

    result.route =
      route.route || route;

    result.foundRoute = true;

    result.routeStationsCount =
      Array.isArray(result.route?.stations)
        ? result.route.stations.length
        : null;
  } catch (e: any) {
    result.errors.route =
      e?.message || String(e);
  }

  try {
    const operation = await plkGet(
      '/operations/train/' +
      encodeURIComponent(scheduleId) +
      '/' +
      encodeURIComponent(orderId) +
      '/' +
      encodeURIComponent(operatingDate),
      apiKey
    );

    result.operation =
      operation.operation || operation;

    result.foundOperation = true;

    result.operationStationsCount =
      Array.isArray(result.operation?.stations)
        ? result.operation.stations.length
        : null;
  } catch (e: any) {
    result.errors.operation =
      e?.message || String(e);
  }

  if (
    !result.foundRoute &&
    !result.foundOperation
  ) {
    return json(result, 502);
  }

  return json(result);
}

export const onRequest: PagesFunction<Env> = async (
  context
) => {
  const { request, env, params } = context;

  const url = new URL(request.url);

  const apiKey =
    env.PDP_API_KEY || '';

  if (!apiKey) {
    return json({
      error:
        'Brak zmiennej środowiskowej PDP_API_KEY'
    }, 500);
  }

  const pathArray =
    (params.path as string[]) || [];

  const targetPath =
    pathArray.join('/');

  /*
   * STARY FRONTEND:
   * /api?action=train-route&...
   *
   * Obsługujemy to bezpośrednio tutaj.
   */
  const action =
    url.searchParams.get('action') || '';

  if (!targetPath && action === 'train-route') {
    return handleTrainRoute(
      url,
      apiKey
    );
  }

  /*
   * Samo /api.
   */
  if (!targetPath) {
    return json({
      ok: true,
      service: 'train-delay-monitor-api',
      message:
        'Cloudflare Pages Function działa',
      path: '/api'
    });
  }

  /*
   * Proxy dla:
   * /api/operations
   * /api/schedules
   * /api/schedules/route/...
   * itd.
   */
  const targetUrl =
    PLK_BASE +
    '/' +
    targetPath +
    url.search;

  try {
    const response = await fetch(
      targetUrl,
      {
        method: request.method,
        headers: {
          'Accept': 'application/json',
          'X-API-Key': apiKey
        }
      }
    );

    const responseHeaders =
      new Headers(response.headers);

    responseHeaders.set(
      'Access-Control-Allow-Origin',
      '*'
    );

    return new Response(
      response.body,
      {
        status: response.status,
        headers: responseHeaders
      }
    );
  } catch (e: any) {
    return json({
      error: 'Proxy Error',
      message:
        e?.message || String(e)
    }, 500);
  }
};
