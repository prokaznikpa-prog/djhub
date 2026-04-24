type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();
const DEFAULT_TTL = 90_000;

function logCache(event: "CACHE HIT" | "FETCH START" | "FETCH END", key: string, detail?: string) {
  if (detail) {
    console.debug(`[requestCache] ${event}: ${key} (${detail})`);
    return;
  }

  console.debug(`[requestCache] ${event}: ${key}`);
}

export function getCachedValue<T>(key: string, opts?: { allowStale?: boolean }): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    return opts?.allowStale ? entry.value as T : null;
  }
  return entry.value as T;
}

export function getCacheSnapshot<T>(key: string): {
  value: T | null;
  exists: boolean;
  isStale: boolean;
} {
  const entry = cache.get(key);
  if (!entry) {
    return { value: null, exists: false, isStale: false };
  }

  const isStale = entry.expiresAt < Date.now();
  logCache("CACHE HIT", key, isStale ? "stale" : "fresh");
  return {
    value: entry.value as T,
    exists: true,
    isStale,
  };
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
  if (cached !== null) {
    logCache("CACHE HIT", key, "fresh");
    return cached;
  }

  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  logCache("FETCH START", key);
  const promise = request()
    .then((value) => {
      setCachedValue(key, value, ttl);
      logCache("FETCH END", key);
      return value;
    })
    .catch((error) => {
      logCache("FETCH END", key, "error");
      throw error;
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
