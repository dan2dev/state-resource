export type ResourceLoader<T, TQuery extends []> = (
  ...query: TQuery
) => Promise<T>;
export class Resource<T, TQuery extends []> {
  private id: string;
  private listeners: Array<() => void> = [];
  private version: number;
  private promise: null | ((...query: TQuery) => Promise<T>) = null;
  private data: {
    state: T | null;
  } = {
    state: null,
  };
  private queryHash: string | null = null;
  constructor(id: string) {
    this.data = { state: null };
    this.version = 1;
    this.id = id;
  }
  public setState(state: T) {
    this.data.state = state;
    this.version++;
    this.emitChange();
  }
  public setPromise(promise: ResourceLoader<T, TQuery>) {
    this.promise = promise;
  }
  public setQuery(queryHash: TQuery) {
    const newQueryHash = JSON.stringify(queryHash);
    if (this.queryHash !== newQueryHash) {
      this.queryHash = newQueryHash;
      this.version++;
      this.emitChange();
    }
  }
  public getSnapshot() {
    return this.version;
  }
  public getState() {
    return this.data.state;
  }
  public subscribe(listener: () => void) {
    this.listeners = [...this.listeners, listener];
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
  public emitChange(): void {
    this.listeners.forEach((listener) => listener());
  }
}
