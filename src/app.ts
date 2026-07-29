import express from 'express';
import cors from 'cors';
import { CONFIG } from './config';
import { schedulesRouter } from './routes/schedules';
import { operationsRouter } from './routes/operations';
import { dictionariesRouter } from './routes/dictionaries';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/schedules', schedulesRouter);
app.use('/api/operations', operationsRouter);
app.use('/api/dictionaries', dictionariesRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(CONFIG.PORT, () => {
  console.log(`🚀 PDP Backend Proxy działa na porcie ${CONFIG.PORT}`);
  console.log(`🔒 Klucz API pobierany bezpiecznie ze środowiska serwera`);
});
