import { startTransition } from "react";
export function isPromise(value: any): value is Promise<any> {
  return value && typeof value.then === "function";
}
export type ResourceLoader<T, TQuery extends []> = (
  ...query: TQuery
) => Promise<T>;
export class Resource<T, TQuery extends []> {
  private id: string;
  private query: TQuery = [] as TQuery;
  private listeners: Array<() => void> = [];
  private version: number;
  private promise: null | ((...query: TQuery) => Promise<T>) = null;
  private data: {
    state: Promise<T> | null;
  } = {
    state: null,
  };
  private isPending: boolean = false;
  private queryHash: string | null = null;
  constructor(id: string) {
    this.data = { state: null };
    this.version = 1;
    this.id = id;
  }
  public setState(state: T | Promise<T> | null) {
    // console.log("ok")
    if (state === null) {
      if (this.data.state === null) {
        return;
      }
      this.data.state = null;
      this.version++;
      this.emitChange();
      return;
    }
    if (typeof state === "function") {
      this.data.state = state(state, ...this.query);
    }
    if (state instanceof Promise) {
      this.isPending = true;
      this.data.state = state;
      this.data.state.then((state) => {
        this.isPending = false;
        this.setState(state);
        return state;
      });
    }
    this.emitChange();
  }
  // public setPromise(promise: ResourceLoader<T, TQuery>) {
  //   this.promise = promise;
  // }
  public setQuery(...query: TQuery) {
    const newQueryHash = JSON.stringify(query);
    if (this.queryHash !== newQueryHash) {
      this.queryHash = newQueryHash;
      this.version++;
      this.emitChange();
    }
  }
  public getState() {
    if (!(this.data.state instanceof Promise)) {
      return this.data.state;
    }

    return new Promise((resolve) => {
      return resolve(this.data.state);
    });
  }
  public getSnapshot() {
    return this.version;
  }

  public getServerSnapshot() {
    return 1;
  }
  public subscribe(listener: () => void) {
    console.log('----');
    console.log(this);
    this.listeners = [...this.listeners, listener];
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
  public emitChange(): void {
    this.listeners.forEach((listener) => listener());
  }
}
