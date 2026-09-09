import { createClient } from 'redis';

let client;
let ready = false;

export function redisEnabled() {
  return Boolean(process.env.REDIS_URL);
}

export async function getRedis() {
  if (!redisEnabled()) return null;
  if (client) return ready ? client : null;
  client = createClient({ url: process.env.REDIS_URL });
  client.on('error', (err) => {
    ready = false;
    console.error('redis error', err.message);
  });
  try {
    await client.connect();
    ready = true;
    return client;
  } catch (e) {
    console.error('redis connect failed', e.message);
    ready = false;
    return null;
  }
}

export async function redisPing() {
  const r = await getRedis();
  if (!r) return { configured: redisEnabled(), ok: false };
  try {
    const pong = await r.ping();
    return { configured: true, ok: pong === 'PONG' };
  } catch {
    return { configured: true, ok: false };
  }
}

/** Sliding window rate limit. Returns { allowed, remaining, retryAfterSec }. */
export async function rateLimit(key, { limit = 120, windowSec = 60 } = {}) {
  const r = await getRedis();
  if (!r) return { allowed: true, remaining: limit, bypassed: true };
  const k = `rl:${key}`;
  const n = await r.incr(k);
  if (n === 1) await r.expire(k, windowSec);
  const ttl = await r.ttl(k);
  if (n > limit) {
    return { allowed: false, remaining: 0, retryAfterSec: ttl > 0 ? ttl : windowSec };
  }
  return { allowed: true, remaining: Math.max(0, limit - n) };
}

export async function cacheGet(key) {
  const r = await getRedis();
  if (!r) return null;
  const v = await r.get(`cache:${key}`);
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

export async function cacheSet(key, value, ttlSec = 30) {
  const r = await getRedis();
  if (!r) return false;
  await r.set(`cache:${key}`, JSON.stringify(value), { EX: ttlSec });
  return true;
}
