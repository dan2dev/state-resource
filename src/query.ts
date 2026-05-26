import { stableKey } from './utils';

const caches = new Map<string, Map<string, Promise<unknown>>>();
const refetchers = new Map<string, Map<string, () => Promise<unknown>>>();
const listeners = new Map<string, Map<string, Set<() => void>>>();

function notify(cacheId: string, argsKey?: string): void {
  const cacheMap = listeners.get(cacheId);
  if (!cacheMap) return;
  if (argsKey !== undefined) {
    cacheMap.get(argsKey)?.forEach(fn => fn());
  } else {
    cacheMap.forEach(set => set.forEach(fn => fn()));
  }
}

export function subscribe(cacheId: string, argsKey: string, listener: () => void): () => void {
  let cacheMap = listeners.get(cacheId);
  if (!cacheMap) listeners.set(cacheId, (cacheMap = new Map()));
  let set = cacheMap.get(argsKey);
  if (!set) cacheMap.set(argsKey, (set = new Set()));
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) cacheMap!.delete(argsKey);
    if (cacheMap!.size === 0) listeners.delete(cacheId);
  };
}

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
  // Cast once at initialization: all entries for this cacheId are Promise<R>
  let cache = caches.get(cacheId) as Map<string, Promise<R>> | undefined;
  if (!cache) caches.set(cacheId, (cache = new Map<string, Promise<R>>()));

  let refetcherMap = refetchers.get(cacheId) as Map<string, () => Promise<R>> | undefined;
  if (!refetcherMap) refetchers.set(cacheId, (refetcherMap = new Map<string, () => Promise<R>>()));

  const load = (...args: A): Promise<R> => {
    const key = stableKey(args);
    const p = fn(...args);
    cache!.set(key, p);
    refetcherMap!.set(key, () => load(...args));
    p.catch(() => {
      if (cache!.get(key) === p) { cache!.delete(key); refetcherMap!.delete(key); }
    });
    return p;
  };

  const query = ((...args: A) => {
    const key = stableKey(args);
    return cache!.get(key) ?? load(...args);
  }) as Query<A, R>;

  query.invalidate = (...args: A) => { void load(...args); notify(cacheId, stableKey(args)); };
  query.clear = () => { cache!.clear(); refetcherMap!.clear(); };
  Object.defineProperty(query, 'cacheId', { value: cacheId });

  return query;
}

export const invalidate = (target: string | { readonly cacheId: string }): void => {
  const id = typeof target === 'string' ? target : target.cacheId;
  refetchers.get(id)?.forEach(refetch => refetch());
  notify(id);
};
