import { useState, useEffect, useCallback, useRef } from 'react';
import { subscribe } from './query';
import type { Query } from './query';
import { stableKey } from './utils';
export { createQuery, invalidate } from './query';
export type { Query } from './query';

export type QueryState<T> =
  | { status: 'loading'; data?: undefined | T; error?: undefined }
  | { status: 'ok'; data: T; error?: undefined }
  | { status: 'error'; data?: undefined | T; error: Error }

/** QueryState<T> with the `refresh` callback included. */
export type QueryResult<T> = QueryState<T> & { refresh: () => void }

export function useQuery<A extends unknown[], R>(
  query: Query<A, R>,
  args: NoInfer<A>,
): QueryResult<R> {
  const argsKey = stableKey(args)
  const argsRef = useRef(args)
  argsRef.current = args

  const [tick, setTick] = useState(0)
  const [state, setState] = useState<QueryState<R>>({ status: 'loading' })

  useEffect(() => {
    return subscribe(query.cacheId, argsKey, () => setTick(t => t + 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.cacheId, argsKey])

  useEffect(() => {
    let cancelled = false
    setState(s => (s.status !== 'loading' ? { status: 'loading', data: s.data } : s))
    query(...argsRef.current).then(
      data => { if (!cancelled) setState({ status: 'ok', data }) },
      err => {
        if (!cancelled)
          setState({ status: 'error', error: err instanceof Error ? err : new Error(String(err)) })
      },
    )
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, argsKey])

  const refresh = useCallback(() => {
    query.invalidate(...argsRef.current)
    // tick is bumped via the subscription listener
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [argsKey])

  return { ...state, refresh }
}
