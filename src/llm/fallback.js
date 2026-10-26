import { logger } from '../utils/logger.js';

// Tries providers in order. A provider that fails is put on cooldown so later chunks/PRs skip it
// instead of paying the timeout/retry cost again (e.g. exhausted free-tier quota, Claude outage).
export function createFallbackClient(clients, { cooldownMs = 5 * 60 * 1000, now = Date.now } = {}) {
  if (clients.length === 1) return clients[0];
  const disabledUntil = new Map();

  return {
    name: clients.map(c => c.name).join(' -> '),
    async review(args) {
      const errors = [];
      const available = clients.filter(c => (disabledUntil.get(c.name) || 0) <= now());
      const order = available.length ? available : clients;
      for (const client of order) {
        try {
          const result = await client.review(args);
          disabledUntil.delete(client.name);
          return { ...result, model: result.model || client.name };
        } catch (error) {
          errors.push(`${client.name}: ${error.message}`);
          disabledUntil.set(client.name, now() + cooldownMs);
          if (client !== order.at(-1)) logger.warn(`LLM provider ${client.name} failed (${error.message}); falling back`);
        }
      }
      throw new Error(`All LLM providers failed:\n - ${errors.join('\n - ')}`);
    }
  };
}
