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
      let resource = resourceMap.get(resourceId);
      if (!resource) {
        resourceMap.set(resourceId, {
          id: resourceId,
          queryHash: "",
        });
      }
      resource = resourceMap.get(resourceId);

      if (resource && resource.queryHash !== queryHash) {
        stateRef.current = promise(...query);
        resourceMap.set(resourceId, {
          id: resourceId,
          queryHash,
          invalidate: id
            ? (() => {
                stateRef.current = promise(...query);
                setVersion((lastVersion) => lastVersion + 1);
              }).bind(setQuery)
            : undefined,
        });
        setVersion((lastVersion) => lastVersion + 1);
      }
    },
    [promise, resourceId, id],
  );

  return [statePromise, setQuery];
}
