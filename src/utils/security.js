import crypto from 'crypto';

export function safeEqual(a, b) {
  const aa = Buffer.from(a || '');
  const bb = Buffer.from(b || '');
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

export function computeSignature(rawBody, secret) {
  return `sha256=${crypto.createHmac('sha256', secret).update(rawBody || '').digest('hex')}`;
}

// Bitbucket Cloud signs webhook payloads with HMAC-SHA256 in the X-Hub-Signature header.
// A plain shared-secret header (x-webhook-secret) is still accepted for proxies that cannot sign.
export function verifyWebhookSecret(req, expectedSecret) {
  if (!expectedSecret) return true;
  const signature = req.header('x-hub-signature-256') || req.header('x-hub-signature');
  if (signature && req.rawBody) {
    return safeEqual(signature, computeSignature(req.rawBody, expectedSecret));
  }
  return safeEqual(req.header('x-webhook-secret') || '', expectedSecret);
}
