import { stableKey } from './utils';

export type Snapshot<T = unknown> =
  | { status: 'loading'; data?: T; error?: undefined }
  | { status: 'ok'; data: T; error?: undefined }
  | { status: 'error'; data?: T; error: Error };

export type Query<A extends readonly unknown[], R> = {
  (...args: A): Promise<R>;
  invalidate(...args: A): void;
  clear(): void;
  readonly cacheId: string;
};

type Listener = () => void;

const caches = new Map<string, Map<string, Promise<unknown>>>();
const refetchers = new Map<string, Map<string, () => Promise<unknown>>>();
const listeners = new Map<string, Map<string, Set<Listener>>>();
const snapshots = new Map<string, Map<string, Snapshot>>();

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  let value = map.get(key);
  if (value === undefined) map.set(key, (value = create()));
  return value;
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function notify(cacheId: string, argsKey?: string): void {
  const cacheMap = listeners.get(cacheId);
  if (!cacheMap) return;
  if (argsKey !== undefined) cacheMap.get(argsKey)?.forEach(fn => fn());
  else cacheMap.forEach(set => set.forEach(fn => fn()));
}

function setLoadingSnapshot(cacheId: string, argsKey: string): void {
  const map = getOrCreate(snapshots, cacheId, () => new Map<string, Snapshot>());
  const prev = map.get(argsKey);
  map.set(argsKey, prev?.data === undefined
    ? { status: 'loading' }
    : { status: 'loading', data: prev.data });
}

function setOkSnapshot(cacheId: string, argsKey: string, data: unknown): void {
  const map = getOrCreate(snapshots, cacheId, () => new Map<string, Snapshot>());
  map.set(argsKey, { status: 'ok', data });
}

function setErrorSnapshot(cacheId: string, argsKey: string, err: unknown): void {
  const map = getOrCreate(snapshots, cacheId, () => new Map<string, Snapshot>());
  const prev = map.get(argsKey);
  const error = toError(err);
  map.set(argsKey, prev?.data === undefined
    ? { status: 'error', error }
    : { status: 'error', data: prev.data, error });
}

export function subscribe(cacheId: string, argsKey: string, listener: Listener): () => void {
  const cacheMap = getOrCreate(listeners, cacheId, () => new Map<string, Set<Listener>>());
  const set = getOrCreate(cacheMap, argsKey, () => new Set<Listener>());
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) cacheMap.delete(argsKey);
    if (cacheMap.size === 0) listeners.delete(cacheId);
  };
}

export function readSnapshot<R>(cacheId: string, argsKey: string): Snapshot<R> | undefined {
  return snapshots.get(cacheId)?.get(argsKey) as Snapshot<R> | undefined;
}

export function setQueryData<R>(
  cacheId: string,
  argsKey: string,
  updater: R | ((prev: R | undefined) => R),
): R {
  const prevData = readSnapshot<R>(cacheId, argsKey)?.data;
  const nextData = typeof updater === 'function'
    ? (updater as (current: R | undefined) => R)(prevData)
    : updater;

  const cache = getOrCreate(caches, cacheId, () => new Map<string, Promise<unknown>>()) as Map<string, Promise<R>>;
  cache.set(argsKey, Promise.resolve(nextData));
  setOkSnapshot(cacheId, argsKey, nextData);
  notify(cacheId, argsKey);
  return nextData;
}

export function createQuery<A extends readonly unknown[], R>(
  cacheId: string,
  fn: (...args: A) => Promise<R>,
): Query<A, R> {
  const cache = getOrCreate(caches, cacheId, () => new Map<string, Promise<unknown>>()) as Map<string, Promise<R>>;
  const refetcherMap = getOrCreate(refetchers, cacheId, () => new Map<string, () => Promise<unknown>>()) as Map<string, () => Promise<R>>;

  const load = (...args: A): Promise<R> => {
    const key = stableKey(args);
    setLoadingSnapshot(cacheId, key);
    notify(cacheId, key);

    const p = fn(...args);
    cache.set(key, p);
    refetcherMap.set(key, () => load(...args));

    p.then(
      data => {
        if (cache.get(key) === p) {
          setOkSnapshot(cacheId, key, data);
          notify(cacheId, key);
        }
      },
      err => {
        if (cache.get(key) === p) {
          setErrorSnapshot(cacheId, key, err);
          notify(cacheId, key);
        }
      },
    );
    p.catch(() => {
      if (cache.get(key) === p) {
        cache.delete(key);
        refetcherMap.delete(key);
      }
    });

    return p;
  };

  const query = ((...args: A) => {
    const key = stableKey(args);
    return cache.get(key) ?? load(...args);
  }) as Query<A, R>;

  query.invalidate = (...args: A) => { void load(...args); };
  query.clear = () => {
    cache.clear();
    refetcherMap.clear();
    snapshots.get(cacheId)?.clear();
  };
  Object.defineProperty(query, 'cacheId', {
    value: cacheId,
    writable: false,
    enumerable: true,
    configurable: false,
  });

  return query;
}

export function invalidate(target: string | { readonly cacheId: string }): void {
  const id = typeof target === 'string' ? target : target.cacheId;
  refetchers.get(id)?.forEach(refetch => { void refetch(); });
}
