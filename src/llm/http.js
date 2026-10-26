import { logger } from '../utils/logger.js';

const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function retryDelay(res, attempt) {
  const header = res?.headers?.get?.('retry-after');
  const seconds = header ? Number(header) : NaN;
  if (!Number.isNaN(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60000);
  return Math.min(1000 * 2 ** attempt, 30000) + Math.floor(Math.random() * 250);
}

export async function postJson(url, { headers, body, timeoutMs, maxRetries, label, fetchImpl = fetch }) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      lastError = new Error(`${label} request failed: ${error.message}`);
      if (attempt < maxRetries) {
        logger.warn(`${lastError.message}; retrying (${attempt + 1}/${maxRetries})`);
        await sleep(retryDelay(null, attempt));
        continue;
      }
      throw lastError;
    }

    if (res.ok) return res.json();

    const text = await res.text();
    lastError = new Error(`${label} call failed: ${res.status} ${text.slice(0, 500)}`);
    lastError.status = res.status;
    if (RETRYABLE.has(res.status) && attempt < maxRetries) {
      logger.warn(`${label} returned ${res.status}; retrying (${attempt + 1}/${maxRetries})`);
      await sleep(retryDelay(res, attempt));
      continue;
    }
    throw lastError;
  }
  throw lastError;
}
