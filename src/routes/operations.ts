import { Router, Request, Response } from 'express';
import { fetchFromPDP } from '../pdpClient';
import { cache } from '../cache';
import { CONFIG } from '../config';

export const operationsRouter = Router();

operationsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const cacheKey = `operations_${JSON.stringify(req.query)}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json(cachedData);
    }

    const data = await fetchFromPDP('/operations', req.query);
    cache.set(cacheKey, data, CONFIG.CACHE_TTL.OPERATIONS);

    return res.json(data);
  } catch (error: any) {
    return res.status(error.status || 500).json(error.data || { error: error.message });
  }
});

operationsRouter.get('/train/:scheduleId/:orderId/:operatingDate', async (req: Request, res: Response) => {
  try {
    const { scheduleId, orderId, operatingDate } = req.params;
    const cacheKey = `train_op_${scheduleId}_${orderId}_${operatingDate}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json(cachedData);
    }

    const data = await fetchFromPDP(`/operations/train/${scheduleId}/${orderId}/${operatingDate}`);
    cache.set(cacheKey, data, CONFIG.CACHE_TTL.OPERATIONS);

    return res.json(data);
  } catch (error: any) {
    return res.status(error.status || 500).json(error.data || { error: error.message });
  }
});
