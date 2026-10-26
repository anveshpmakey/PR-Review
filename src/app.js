import express from 'express';
import { createWebhookRouter } from './routes/webhook.js';

export function createApp({ config, queue }) {
  const app = express();
  app.use(express.json({
    limit: '5mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    }
  }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, providers: config.llm.providers, queue: queue.stats?.() });
  });

  app.use('/webhook', createWebhookRouter({ config, queue }));

  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
  });

  return app;
}
