import { Router, Request, Response } from 'express';
import { fetchFromPDP } from '../pdpClient';
import { cache } from '../cache';
import { CONFIG } from '../config';

export const dictionariesRouter = Router();

dictionariesRouter.get('/stations', async (req: Request, res: Response) => {
  try {
    const cacheKey = `stations_${JSON.stringify(req.query)}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json(cachedData);
    }

    const data = await fetchFromPDP('/dictionaries/stations', req.query);
    cache.set(cacheKey, data, CONFIG.CACHE_TTL.DICTIONARIES);

    return res.json(data);
  } catch (error: any) {
    return res.status(error.status || 500).json(error.data || { error: error.message });
  }
});

dictionariesRouter.get('/carriers', async (req: Request, res: Response) => {
  try {
    const cacheKey = 'carriers_all';
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json(cachedData);
    }

    const data = await fetchFromPDP('/dictionaries/carriers');
    cache.set(cacheKey, data, CONFIG.CACHE_TTL.DICTIONARIES);

    return res.json(data);
  } catch (error: any) {
    return res.status(error.status || 500).json(error.data || { error: error.message });
  }
});
