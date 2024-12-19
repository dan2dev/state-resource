import { use, useCallback, useId, useRef, useState } from "react";

export type UseResourceReturn<T, TQuery extends any[] = []> = [
  result: T,
  setQuery: (...query: TQuery) => void,
];

export type ResourceState<T> = {
  id: string;
  queryHash: string;
  invalidate?: () => void;
};
function getResourceState<T>(id: string): ResourceState<T> {
  const state = resourceMap.get(id);
  if (!state) {
    throw new Error(`Resource ${id} not found`);
  }
  return state;
}

export const resourceMap = new Map<string, ResourceState<any>>();

export function invalidate(id: string) {
  const resource = resourceMap.get(id);
  if (resource) {
    resource.invalidate?.();
  }
}
export function useResource<T, TQuery extends any[]>(
  promise: (...args: TQuery) => Promise<T>,
  id?: string,
): UseResourceReturn<T, TQuery> {
  const resourceId = !id ? useId() : id;
  const [version, setVersion] = useState(0);
  const initialRef = useRef(new Promise<T>((resolve) => resolve({} as T)));
  const stateRef = useRef(initialRef.current);
  const statePromise = use(stateRef.current);

  const setQuery = useCallback(
    (...query: TQuery) => {
      const queryHash = JSON.stringify(query);
      const resource = resourceMap.get(resourceId);
      if (!resource) {
        resourceMap.set(resourceId, {
          id: resourceId,
          queryHash: JSON.stringify(query),
          invalidate: !!id
            ? () => setVersion((lastVersion) => lastVersion + 1)
            : undefined,
        });
      }

      if (resource && resource.queryHash !== queryHash) {
        stateRef.current = promise(...query);
        resourceMap.set(resourceId, {
          id: resourceId,
          queryHash,
          invalidate: !!id
            ? (() => setQuery(...query)).bind(setQuery)
            : undefined,
        });
        setVersion((lastVersion) => lastVersion + 1);
      }
    },
    [promise, resourceId, id],
  );

  return [statePromise, setQuery];
}
