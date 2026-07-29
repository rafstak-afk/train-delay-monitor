import { Router, Request, Response } from 'express';
import { fetchFromPDP } from '../pdpClient';
import { cache } from '../cache';
import { CONFIG } from '../config';

export const schedulesRouter = Router();

schedulesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const cacheKey = `schedules_${JSON.stringify(req.query)}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json(cachedData);
    }

    const data = await fetchFromPDP('/schedules', req.query);
    cache.set(cacheKey, data, CONFIG.CACHE_TTL.SCHEDULES);
    
    return res.json(data);
  } catch (error: any) {
    return res.status(error.status || 500).json(error.data || { error: error.message });
  }
});

schedulesRouter.get('/route/:scheduleId/:orderId', async (req: Request, res: Response) => {
  try {
    const { scheduleId, orderId } = req.params;
    const cacheKey = `route_${scheduleId}_${orderId}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json(cachedData);
    }

    const data = await fetchFromPDP(`/schedules/route/${scheduleId}/${orderId}`);
    cache.set(cacheKey, data, CONFIG.CACHE_TTL.SCHEDULES);

    return res.json(data);
  } catch (error: any) {
    return res.status(error.status || 500).json(error.data || { error: error.message });
  }
});
