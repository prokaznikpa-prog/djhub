type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();
const DEFAULT_TTL = 60_000;

export function getCachedValue<T>(key: string, opts?: { allowStale?: boolean }): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    return opts?.allowStale ? entry.value as T : null;
  }
  return entry.value as T;
}

export function setCachedValue<T>(key: string, value: T, ttl = DEFAULT_TTL) {
  cache.set(key, { value, expiresAt: Date.now() + ttl });
}

export function patchCachedListsWhere<T extends { id: string }>(
  predicate: (key: string) => boolean,
  updater: (items: T[], key: string) => T[],
  ttl = DEFAULT_TTL,
) {
  for (const [key] of cache) {
    if (!predicate(key)) continue;
    const current = getCachedValue<T[]>(key, { allowStale: true });
    if (!current) continue;
    setCachedValue(key, updater(current, key), ttl);
  }
}

export async function cachedRequest<T>(key: string, request: () => Promise<T>, ttl = DEFAULT_TTL): Promise<T> {
  const cached = getCachedValue<T>(key);
  if (cached !== null) return cached;

  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = request()
    .then((value) => {
      setCachedValue(key, value, ttl);
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

export function patchCachedList<T extends { id: string }>(key: string, updater: (items: T[]) => T[], ttl = DEFAULT_TTL) {
  const current = getCachedValue<T[]>(key, { allowStale: true });
  if (!current) return;
  setCachedValue(key, updater(current), ttl);
}
