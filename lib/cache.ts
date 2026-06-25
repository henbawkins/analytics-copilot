// Simple in-memory TTL cache.
//
// Google API calls (GA4/GSC) are free but rate-limited; caching keeps repeated
// team queries fast and within quota. When you later add paid sources
// (DataForSEO, Semrush) swap this for a shared store (Vercel KV / Postgres) so
// the cache survives across serverless invocations and instances — the
// interface below is intentionally small to make that swap easy.

type Entry = { value: unknown; expires: number };

const store = new Map<string, Entry>();

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expires) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet(key: string, value: unknown, ttlSeconds = 600): void {
  store.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
}

/** Wrap an async producer with cache-aside semantics. */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  produce: () => Promise<T>,
): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const value = await produce();
  cacheSet(key, value, ttlSeconds);
  return value;
}
