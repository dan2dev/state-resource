import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { subscribe, readSnapshot, setQueryData } from './query';
import type { Query, Snapshot } from './query';
import { stableKey } from './utils';

export { createQuery, invalidate } from './query';
export type { Query, Snapshot } from './query';

export type QueryState<T> = Snapshot<T>;

export type QueryResult<T> = QueryState<T> & {
  refresh: () => void;
  setData: (next: T | ((prev: T | undefined) => T)) => T;
};

const LOADING_FALLBACK: Snapshot<never> = { status: 'loading' };

export function useQuery<A extends readonly unknown[], R>(
  query: Query<A, R>,
  args: NoInfer<A>,
): QueryResult<R> {
  const argsKey = stableKey(args);

  const argsRef = useRef(args);
  const keyRef = useRef(argsKey);
  // eslint-disable-next-line react-hooks/refs
  argsRef.current = args;
  // eslint-disable-next-line react-hooks/refs
  keyRef.current = argsKey;

  const subscribeToStore = useCallback(
    (onChange: () => void) => subscribe(query.cacheId, argsKey, onChange),
    [query.cacheId, argsKey],
  );

  const getSnapshot = useCallback(
    (): Snapshot<R> => readSnapshot<R>(query.cacheId, argsKey) ?? (LOADING_FALLBACK as Snapshot<R>),
    [query.cacheId, argsKey],
  );

  const snapshot = useSyncExternalStore(subscribeToStore, getSnapshot, getSnapshot);

  // SWR across args changes: remember the most recently displayed data so the
  // next loading state for a different key can render with stale data instead
  // of flashing empty. Using state (not a ref) so React drives the comparison;
  // the conditional setter avoids redundant re-renders.
  const [sticky, setSticky] = useState<R | undefined>(undefined);
  if (snapshot.status === 'ok' && sticky !== snapshot.data) {
    setSticky(() => snapshot.data);
  }

  const view: Snapshot<R> =
    snapshot.status === 'loading' && snapshot.data === undefined && sticky !== undefined
      ? { status: 'loading', data: sticky }
      : snapshot;

  useEffect(() => {
    void query(...argsRef.current).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.cacheId, argsKey]);

  const refresh = useCallback(() => {
    query.invalidate(...argsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, argsKey]);

  const setData = useCallback(
    (next: R | ((prev: R | undefined) => R)) => setQueryData<R>(query.cacheId, keyRef.current, next),
    [query.cacheId],
  );

  return { ...view, refresh, setData };
}
