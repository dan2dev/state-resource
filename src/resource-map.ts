import { Resource } from "./resource";

export const resourceMap = new Map<string, Resource<any, any>>();

export function getResource<T, TQuery extends []>(
  id: string,
): Resource<T, TQuery> {
  console.log('getResource', id);
  if (!resourceMap.has(id)) {
    resourceMap.set(id, new Resource(id));
  }
  return resourceMap.get(id) as Resource<T, TQuery>;
}

export function invalidate(id: string) {
  const resource = resourceMap.get(id);
  if (resource) {
    resource.emitChange();
  }
}
