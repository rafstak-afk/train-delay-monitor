import { CONFIG } from './config';

export async function fetchFromPDP(
  endpointPath: string, 
  queryParams: Record<string, any> = {}
) {
  const url = new URL(`${CONFIG.PDP_BASE_URL}${endpointPath}`);
  
  Object.keys(queryParams).forEach(key => {
    if (queryParams[key] !== undefined && queryParams[key] !== null) {
      url.searchParams.append(key, String(queryParams[key]));
    }
  });

  // Odczyt klucza wyłącznie ze środowiska serwera
  const apiKey = process.env.PDP_API_KEY || process.env.PLK_API_KEY || '';

  if (!apiKey) {
    console.warn('⚠️ OSTRZEŻENIE: Brak klucza API w środowisku serwera (process.env.PDP_API_KEY / PLK_API_KEY)');
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-API-Key': apiKey
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let parsedError;
    try {
      parsedError = JSON.parse(errorBody);
    } catch {
      parsedError = { message: errorBody };
    }

    const error = new Error(`PDP API Error ${response.status}`);
    (error as any).status = response.status;
    (error as any).data = parsedError;
    throw error;
  }

  return await response.json();
}
