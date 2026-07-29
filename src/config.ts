import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
  PORT: process.env.PORT || 3000,
  PDP_BASE_URL: process.env.PDP_API_BASE_URL || 'https://pdp-api.plk-sa.pl/api/v1',
  CACHE_TTL: {
    DICTIONARIES: Number(process.env.CACHE_TTL_DICTIONARIES) || 86400,
    SCHEDULES: Number(process.env.CACHE_TTL_SCHEDULES) || 1800,
    OPERATIONS: Number(process.env.CACHE_TTL_OPERATIONS) || 30,
  }
};
