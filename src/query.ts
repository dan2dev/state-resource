const caches = new Map<string, Map<string, Promise<unknown>>>();
const refetchers = new Map<string, Map<string, () => Promise<unknown>>>();

const stableKey = (args: unknown[]) =>
  JSON.stringify(args, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );

export type Query<A extends unknown[], R> = {
  (...args: A): Promise<R>;
  invalidate(...args: A): void;
  clear(): void;
  readonly cacheId: string;
};

export function createQuery<A extends unknown[], R>(
  cacheId: string,
  fn: (...args: A) => Promise<R>,
): Query<A, R> {
  let cache = caches.get(cacheId);
  if (!cache) caches.set(cacheId, (cache = new Map()));

  let refetcherMap = refetchers.get(cacheId);
  if (!refetcherMap) refetchers.set(cacheId, (refetcherMap = new Map()));

  const load = (...args: A): Promise<R> => {
    const key = stableKey(args);
    const p = fn(...args);
    cache!.set(key, p);
    refetcherMap!.set(key, () => load(...args));
    p.catch(() => { cache!.delete(key); refetcherMap!.delete(key); });
    return p;
  };

  const query = ((...args: A) => {
    const key = stableKey(args);
    return (cache!.get(key) as Promise<R> | undefined) ?? load(...args);
  }) as Query<A, R>;

  query.invalidate = (...args: A) => void load(...args);
  query.clear = () => { cache!.clear(); refetcherMap!.clear(); };
  Object.defineProperty(query, 'cacheId', { value: cacheId });

  return query;
}

export const invalidate = (cacheId: string) =>
  refetchers.get(cacheId)?.forEach(refetch => refetch());
