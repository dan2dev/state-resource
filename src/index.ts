import { useState, useEffect, useCallback, useRef } from 'react';
import { subscribe, readSnapshot, setQueryData } from './query';
import type { Query } from './query';
import { stableKey } from './utils';
export { createQuery, invalidate } from './query';
export type { Query } from './query';

export type QueryState<T> =
  | { status: 'loading'; data?: undefined | T; error?: undefined }
  | { status: 'ok'; data: T; error?: undefined }
  | { status: 'error'; data?: undefined | T; error: Error }

/** QueryState<T> with the `refresh` callback included. */
export type QueryResult<T> = QueryState<T> & {
  refresh: () => void;
  setData: (next: T | ((prev: T | undefined) => T)) => T;
}

export function useQuery<A extends unknown[], R>(
  query: Query<A, R>,
  args: NoInfer<A>,
): QueryResult<R> {
  const argsKey = stableKey(args)
  const argsRef = useRef(args)
  const keyRef = useRef(argsKey)
  // eslint-disable-next-line react-hooks/refs
  argsRef.current = args
  // eslint-disable-next-line react-hooks/refs
  keyRef.current = argsKey

  const [state, setState] = useState<QueryState<R>>(
    () => readSnapshot<R>(query.cacheId, argsKey) ?? { status: 'loading' },
  )

  useEffect(() => {
    const syncFromSnapshot = () => {
      const snapshot = readSnapshot<R>(query.cacheId, argsKey)
      if (!snapshot) return
      if (snapshot.status === 'loading' && snapshot.data === undefined) {
        setState(prev => (prev.data === undefined ? snapshot : { status: 'loading', data: prev.data }))
        return
      }
      setState(snapshot)
    }

    const unsubscribe = subscribe(query.cacheId, argsKey, syncFromSnapshot)
    syncFromSnapshot()
    return unsubscribe
  }, [query.cacheId, argsKey])

  useEffect(() => {
    const snapshot = readSnapshot<R>(query.cacheId, argsKey)
    if (!snapshot) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(s => (s.status !== 'loading' ? { status: 'loading', data: s.data } : s))
    }
    void query(...argsRef.current).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.cacheId, argsKey])

  const refresh = useCallback(() => {
    query.invalidate(...argsRef.current)
    // tick is bumped via the subscription listener
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [argsKey])

  const setData = useCallback((next: R | ((prev: R | undefined) => R)) => {
    return setQueryData(query.cacheId, keyRef.current, next)
  }, [query.cacheId])

  return { ...state, refresh, setData }
}
