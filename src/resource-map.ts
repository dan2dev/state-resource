import { Resource } from "./resource";

export type ResourceState<T> = {
  id: string;
  queryHash: string;
};

export const resourceMap = new Map<string, Resource<any, any>>();

export function getResource<T, TQuery extends []>(
  id: string,
  builder: () => Resource<T, TQuery>,
): Resource<T, TQuery> {
  if (!resourceMap.has(id)) {
    let resource: Resource<T, TQuery> = builder();
    resourceMap.set(id, resource);
    return resource;
  }
  return resourceMap.get(id) as Resource<T, TQuery>;
}

export function invalidate(id: string) {
  const resource = resourceMap.get(id);
  if (resource) {
    resource.emitChange();
  }
}
