import { stableKey } from './utils';

const caches = new Map<string, Map<string, Promise<unknown>>>();
const refetchers = new Map<string, Map<string, () => Promise<unknown>>>();
const listeners = new Map<string, Map<string, Set<() => void>>>();

type Snapshot =
  | { status: 'loading'; data?: unknown; error?: undefined }
  | { status: 'ok'; data: unknown; error?: undefined }
  | { status: 'error'; data?: unknown; error: Error };

const snapshots = new Map<string, Map<string, Snapshot>>();

function notify(cacheId: string, argsKey?: string): void {
  const cacheMap = listeners.get(cacheId);
  if (!cacheMap) return;
  if (argsKey !== undefined) {
    cacheMap.get(argsKey)?.forEach(fn => fn());
  } else {
    cacheMap.forEach(set => set.forEach(fn => fn()));
  }
}

function getSnapshotMap(cacheId: string): Map<string, Snapshot> {
  let map = snapshots.get(cacheId);
  if (!map) snapshots.set(cacheId, (map = new Map()));
  return map;
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function setLoadingSnapshot(cacheId: string, argsKey: string): void {
  const map = getSnapshotMap(cacheId);
  const prev = map.get(argsKey);
  map.set(argsKey, prev?.data === undefined
    ? { status: 'loading' }
    : { status: 'loading', data: prev.data });
}

function setOkSnapshot(cacheId: string, argsKey: string, data: unknown): void {
  getSnapshotMap(cacheId).set(argsKey, { status: 'ok', data });
}

function setErrorSnapshot(cacheId: string, argsKey: string, err: unknown): void {
  const error = toError(err);
  const prev = getSnapshotMap(cacheId).get(argsKey);
  getSnapshotMap(cacheId).set(argsKey, prev?.data === undefined
    ? { status: 'error', error }
    : { status: 'error', data: prev.data, error });
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

export function readSnapshot<R>(cacheId: string, argsKey: string):
  | { status: 'loading'; data?: R; error?: undefined }
  | { status: 'ok'; data: R; error?: undefined }
  | { status: 'error'; data?: R; error: Error }
  | undefined {
  return snapshots.get(cacheId)?.get(argsKey) as
    | { status: 'loading'; data?: R; error?: undefined }
    | { status: 'ok'; data: R; error?: undefined }
    | { status: 'error'; data?: R; error: Error }
    | undefined;
}

export function setQueryData<R>(
  cacheId: string,
  argsKey: string,
  updater: R | ((prev: R | undefined) => R),
): R {
  const prev = readSnapshot<R>(cacheId, argsKey);
  const prevData = prev?.data;
  const nextData = typeof updater === 'function'
    ? (updater as (current: R | undefined) => R)(prevData)
    : updater;

  let cache = caches.get(cacheId) as Map<string, Promise<R>> | undefined;
  if (!cache) caches.set(cacheId, (cache = new Map<string, Promise<R>>()));

  setOkSnapshot(cacheId, argsKey, nextData);
  cache.set(argsKey, Promise.resolve(nextData));
  notify(cacheId, argsKey);
  return nextData;
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
    setLoadingSnapshot(cacheId, key);
    notify(cacheId, key);

    const p = fn(...args);
    cache!.set(key, p);
    refetcherMap!.set(key, () => load(...args));
    p.then(
      data => {
        if (cache!.get(key) === p) {
          setOkSnapshot(cacheId, key, data);
          notify(cacheId, key);
        }
      },
      err => {
        if (cache!.get(key) === p) {
          setErrorSnapshot(cacheId, key, err);
          notify(cacheId, key);
        }
      },
    );
    p.catch(() => {
      if (cache!.get(key) === p) { cache!.delete(key); refetcherMap!.delete(key); }
    });
    return p;
  };

  const query = ((...args: A) => {
    const key = stableKey(args);
    return cache!.get(key) ?? load(...args);
  }) as Query<A, R>;

  query.invalidate = (...args: A) => { void load(...args); };
  query.clear = () => {
    cache!.clear();
    refetcherMap!.clear();
    snapshots.get(cacheId)?.clear();
  };
  Object.defineProperty(query, 'cacheId', { value: cacheId });

  return query;
}

export const invalidate = (target: string | { readonly cacheId: string }): void => {
  const id = typeof target === 'string' ? target : target.cacheId;
  refetchers.get(id)?.forEach(refetch => refetch());
};
