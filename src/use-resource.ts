import { use, useCallback, useId, useRef, useState } from "react";

export type UseResourceReturn<T, TQuery extends any[] = []> = [
  result: T,
  setQuery: (...query: TQuery) => void,
];

export type ResourceState<T> = {
  id: string;
  queryHash: string;
};
function getResourceState<T>(id: string): ResourceState<T> {
  const state = resourceMap.get(id);
  if (!state) {
    throw new Error(`Resource ${id} not found`);
  }
  return state;
}

export const resourceMap = new Map<string, ResourceState<any>>();

export function useResource<T>(
  promise: () => Promise<T>,
  optimistic?: () => T,
): UseResourceReturn<T, any[]>;
export function useResource<T, TQuery extends any[]>(
  promise: (...args: TQuery) => Promise<T>,
  optimistic?: (...args: TQuery) => T,
): UseResourceReturn<T, TQuery>;
export function useResource<T, TQuery extends any[]>(
  promise: (...args: TQuery) => Promise<T>,
  optimistic?: (...args: TQuery) => Promise<T>,
): UseResourceReturn<T, TQuery> {
  const resourceId = useId();
  const [version, setVersion] = useState(0);
  const initialRef = useRef(new Promise<T>((resolve) => resolve({} as T)));
  const stateRef = useRef(initialRef.current);
  const statePromise = use(stateRef.current);
  const setQuery = useCallback(
    (...query: TQuery) => {
      const queryHash = JSON.stringify(query);
      const resource = resourceMap.get(resourceId);
      if (resource && resource.queryHash !== queryHash) {
        stateRef.current = promise(...query);
        resourceMap.set(resourceId, {
          id: resourceId,
          queryHash,
        });
        setVersion((lastVersion) => lastVersion + 1);
      }
    },
    [promise],
  );
  return [statePromise, setQuery];
}
