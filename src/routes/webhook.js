import { Router } from 'express';
import { verifyWebhookSecret } from '../utils/security.js';

const PR_EVENTS = ['pullrequest:created', 'pullrequest:updated'];
const COMMENT_EVENT = 'pullrequest:comment_created';

export function createWebhookRouter({ config, queue }) {
  const router = Router();

  router.post('/bitbucket', (req, res) => {
    if (!verifyWebhookSecret(req, config.webhookSecret)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const event = req.header('x-event-key') || '';
    const prId = req.body?.pullrequest?.id;
    const repo = req.body?.repository?.full_name
      || (config.bitbucket.workspace && config.bitbucket.repoSlug ? `${config.bitbucket.workspace}/${config.bitbucket.repoSlug}` : null);

    let force = false;
    if (event === COMMENT_EVENT) {
      const raw = req.body?.comment?.content?.raw || '';
      const phrase = config.review.triggerPhrase;
      if (!phrase || !raw.includes(phrase) || raw.includes('ai-pr-review')) {
        return res.status(200).json({ ignored: true, event });
      }
      force = true;
    } else if (!PR_EVENTS.includes(event)) {
      return res.status(200).json({ ignored: true, event });
    }

    if (!prId) return res.status(400).json({ error: 'Missing pullrequest.id in payload' });
    if (!repo) return res.status(400).json({ error: 'Missing repository.full_name in payload' });
    if (config.allowedRepos.length && !config.allowedRepos.includes(repo)) {
      return res.status(403).json({ error: `Repository ${repo} is not allowed` });
    }

    queue.enqueue(`${repo}#${prId}`, { repo, prId, force });
    return res.status(202).json({ accepted: true, event, repo, prId, force });
  });

  return router;
}
