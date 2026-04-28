import crypto from 'crypto';

export function safeEqual(a, b) {
  const aa = Buffer.from(a || '');
  const bb = Buffer.from(b || '');
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

export function verifyWebhookSecret(req, expectedSecret) {
  if (!expectedSecret) return true;
  const candidate = req.header('x-webhook-secret') || req.header('x-hub-secret') || '';
  return safeEqual(candidate, expectedSecret);
}
