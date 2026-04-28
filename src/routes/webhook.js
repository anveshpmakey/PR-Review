import { Router } from 'express';
import { reviewPullRequest } from '../services/prReviewService.js';
import { verifyWebhookSecret } from '../utils/security.js';
import { config } from '../config/env.js';

export const webhookRouter = Router();

webhookRouter.post('/bitbucket', async (req, res) => {
  try {
    if (!verifyWebhookSecret(req, config.webhookSecret)) {
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }

    const event = req.header('x-event-key') || '';
    if (!['pullrequest:created', 'pullrequest:updated'].includes(event)) {
      return res.status(200).json({ ignored: true, event });
    }

    const prId = req.body?.pullrequest?.id;
    if (!prId) return res.status(400).json({ error: 'Missing pullrequest.id in payload' });

    const result = await reviewPullRequest(prId);
    return res.status(200).json({ ok: true, event, result });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
