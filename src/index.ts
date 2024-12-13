import { use, useCallback, useRef, useState } from "react";

export type UseResourceReturn<T, TQuery extends any[] = []> = [
  result: T,
  setQuery: (...query: TQuery) => void,
];

export function useResource<T>(
  promise: () => Promise<T>,
): UseResourceReturn<T, any[]>;
export function useResource<T, TQuery extends any[]>(
  promise: (...args: TQuery) => Promise<T>,
): UseResourceReturn<T, TQuery>;
export function useResource<T, TQuery extends any[]>(
  promise: (...args: TQuery) => Promise<T>,
): UseResourceReturn<T, TQuery> {
  const [version, setVersion] = useState(0);
  const initialRef = useRef(
    new Promise<T>((resolve) => resolve({ data: "dados da api" } as T)),
  );
  const stateRef = useRef(initialRef.current);
  const statePromise = use(stateRef.current);
  const setQuery = useCallback(
    (...query: TQuery) => {
      stateRef.current = promise(...query);
      setVersion((lastVersion) => lastVersion + 1);
    },
    [promise],
  );
  return [statePromise, setQuery];
}
