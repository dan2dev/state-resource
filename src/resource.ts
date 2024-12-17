export class Resource<T> {
  private id: string;
  private listeners: Array<() => void> = [];
  private version: number = 0;

  constructor(id: string) {
    this.version = 0;
    this.id = id;
  }
  public getSnapshot() {
    return this.version;
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
