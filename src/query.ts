import { stableKey } from "./utils";

export type Snapshot<T = unknown> =
  | { status: "loading"; data?: T; error?: undefined }
  | { status: "ok"; data: T; error?: undefined }
  | { status: "error"; data?: T; error: Error };

export type Query<A extends readonly unknown[], R> = {
  (...args: A): Promise<R>;
  invalidate(...args: A): void;
  abort(): void;
  abort(...args: A): void;
  abortAll(): void;
  clear(): void;
  readonly cacheId: string;
};

type Listener = () => void;

const caches = new Map<string, Map<string, Promise<unknown>>>();
const refetchers = new Map<string, Map<string, () => Promise<unknown>>>();
const listeners = new Map<string, Map<string, Set<Listener>>>();
const snapshots = new Map<string, Map<string, Snapshot>>();
const controllers = new Map<string, Map<string, AbortController>>();

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
  if (argsKey !== undefined) cacheMap.get(argsKey)?.forEach((fn) => fn());
  else cacheMap.forEach((set) => set.forEach((fn) => fn()));
}

function createAbortError(): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException("The operation was aborted.", "AbortError");
  }
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function withAbort<R>(promise: Promise<R>, signal: AbortSignal): Promise<R> {
  if (signal.aborted) return Promise.reject(createAbortError());

  return new Promise<R>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      fn();
    };
    const onAbort = () => settle(() => reject(createAbortError()));

    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => settle(() => resolve(value)),
      (error) => settle(() => reject(error)),
    );
  });
}

function deleteCacheEntry(cacheId: string, argsKey: string): void {
  caches.get(cacheId)?.delete(argsKey);
  refetchers.get(cacheId)?.delete(argsKey);
}

function abortEntry(
  cacheId: string,
  argsKey: string,
  options: { deleteCached?: boolean } = {},
): void {
  const cacheMap = controllers.get(cacheId);
  const controller = cacheMap?.get(argsKey);
  if (controller) {
    cacheMap?.delete(argsKey);
    if (cacheMap?.size === 0) controllers.delete(cacheId);
    if (!controller.signal.aborted) controller.abort();
    deleteCacheEntry(cacheId, argsKey);
    return;
  }

  if (options.deleteCached === true) deleteCacheEntry(cacheId, argsKey);
}

function abortAllEntries(cacheId: string): void {
  const cacheMap = controllers.get(cacheId);
  if (!cacheMap) return;
  [...cacheMap.keys()].forEach((argsKey) => abortEntry(cacheId, argsKey));
}

function setLoadingSnapshot(cacheId: string, argsKey: string): void {
  const map = getOrCreate(
    snapshots,
    cacheId,
    () => new Map<string, Snapshot>(),
  );
  const prev = map.get(argsKey);
  map.set(
    argsKey,
    prev?.data === undefined
      ? { status: "loading" }
      : { status: "loading", data: prev.data },
  );
}

function setOkSnapshot(cacheId: string, argsKey: string, data: unknown): void {
  const map = getOrCreate(
    snapshots,
    cacheId,
    () => new Map<string, Snapshot>(),
  );
  map.set(argsKey, { status: "ok", data });
}

function setErrorSnapshot(
  cacheId: string,
  argsKey: string,
  err: unknown,
): void {
  const map = getOrCreate(
    snapshots,
    cacheId,
    () => new Map<string, Snapshot>(),
  );
  const prev = map.get(argsKey);
  const error = toError(err);
  map.set(
    argsKey,
    prev?.data === undefined
      ? { status: "error", error }
      : { status: "error", data: prev.data, error },
  );
}

export function subscribe(
  cacheId: string,
  argsKey: string,
  listener: Listener,
): () => void {
  const cacheMap = getOrCreate(
    listeners,
    cacheId,
    () => new Map<string, Set<Listener>>(),
  );
  const set = getOrCreate(cacheMap, argsKey, () => new Set<Listener>());
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) {
      cacheMap.delete(argsKey);
      abortEntry(cacheId, argsKey);
    }
    if (cacheMap.size === 0) listeners.delete(cacheId);
  };
}

export function readSnapshot<R>(
  cacheId: string,
  argsKey: string,
): Snapshot<R> | undefined {
  return snapshots.get(cacheId)?.get(argsKey) as Snapshot<R> | undefined;
}

export function setQueryData<R>(
  cacheId: string,
  argsKey: string,
  updater: R | ((prev: R | undefined) => R),
): R {
  const prevData = readSnapshot<R>(cacheId, argsKey)?.data;
  const nextData =
    typeof updater === "function"
      ? (updater as (current: R | undefined) => R)(prevData)
      : updater;

  const cache = getOrCreate(
    caches,
    cacheId,
    () => new Map<string, Promise<unknown>>(),
  ) as Map<string, Promise<R>>;
  cache.set(argsKey, Promise.resolve(nextData));
  setOkSnapshot(cacheId, argsKey, nextData);
  notify(cacheId, argsKey);
  return nextData;
}

export function createQuery<A extends readonly unknown[], R>(
  cacheId: string,
  fn: (...args: A) => Promise<R>,
): Query<A, R> {
  const cache = getOrCreate(
    caches,
    cacheId,
    () => new Map<string, Promise<unknown>>(),
  ) as Map<string, Promise<R>>;
  const refetcherMap = getOrCreate(
    refetchers,
    cacheId,
    () => new Map<string, () => Promise<unknown>>(),
  ) as Map<string, () => Promise<R>>;

  const load = (...args: A): Promise<R> => {
    const key = stableKey(args);
    setLoadingSnapshot(cacheId, key);
    notify(cacheId, key);

    abortEntry(cacheId, key, { deleteCached: true });
    const controller = new AbortController();
    const controllerMap = getOrCreate(
      controllers,
      cacheId,
      () => new Map<string, AbortController>(),
    );
    controllerMap.set(key, controller);

    let source: Promise<R>;
    try {
      source = Promise.resolve(fn(...args));
    } catch (error) {
      source = Promise.reject(error);
    }
    const p = withAbort(source, controller.signal);
    cache.set(key, p);
    refetcherMap.set(key, () => load(...args));

    p.then(
      (data) => {
        if (cache.get(key) === p) {
          setOkSnapshot(cacheId, key, data);
          notify(cacheId, key);
        }
      },
      (err) => {
        if (cache.get(key) === p && controller?.signal.aborted !== true) {
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
    }).finally(() => {
      if (controllers.get(cacheId)?.get(key) === controller) {
        controllers.get(cacheId)?.delete(key);
        if (controllers.get(cacheId)?.size === 0) controllers.delete(cacheId);
      }
    });

    return p;
  };

  const query = ((...args: A) => {
    const key = stableKey(args);
    return cache.get(key) ?? load(...args);
  }) as Query<A, R>;

  query.invalidate = (...args: A) => {
    void load(...args);
  };
  query.abort = (...args: A) => {
    if (args.length === 0) {
      abortAllEntries(cacheId);
      return;
    }
    abortEntry(cacheId, stableKey(args), { deleteCached: true });
  };
  query.abortAll = () => {
    abortAllEntries(cacheId);
  };
  query.clear = () => {
    abortAllEntries(cacheId);
    cache.clear();
    refetcherMap.clear();
    snapshots.get(cacheId)?.clear();
  };
  Object.defineProperty(query, "cacheId", {
    value: cacheId,
    writable: false,
    enumerable: true,
    configurable: false,
  });

  return query;
}

export function invalidate(
  target: string | { readonly cacheId: string },
): void {
  const id = typeof target === "string" ? target : target.cacheId;
  const entries = [...(refetchers.get(id)?.values() ?? [])];
  entries.forEach((refetch) => {
    void refetch();
  });
}

export function abort(target: string | { readonly cacheId: string }): void;
export function abort(
  target: string | { readonly cacheId: string },
  ...args: readonly unknown[]
): void;
export function abort(
  target: string | { readonly cacheId: string },
  ...args: readonly unknown[]
): void {
  const id = typeof target === "string" ? target : target.cacheId;
  if (args.length === 0) {
    abortAllEntries(id);
    return;
  }
  abortEntry(id, stableKey(args), { deleteCached: true });
}
