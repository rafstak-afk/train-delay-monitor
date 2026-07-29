import NodeCache from 'node-cache';

class CacheService {
  private cache: NodeCache;

  constructor() {
    this.cache = new NodeCache({ stdTTL: 60, checkperiod: 120 });
  }

  public get<T>(key: string): T | undefined {
    return this.cache.get<T>(key);
  }

  public set<T>(key: string, value: T, ttlSeconds: number): boolean {
    return this.cache.set(key, value, ttlSeconds);
  }
}

export const cache = new CacheService();
