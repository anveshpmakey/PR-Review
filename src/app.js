import express from 'express';
import { webhookRouter } from './routes/webhook.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/webhook', webhookRouter);

  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  });

  return app;
}
