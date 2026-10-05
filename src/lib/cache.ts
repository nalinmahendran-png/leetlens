/** Tiny in-memory TTL cache. Per server instance; swap for Redis when you scale out. */
interface Entry<T> {
  value: T;
  expires: number;
}

export class TtlCache<T> {
  private store = new Map<string, Entry<T>>();
  constructor(private ttlMs: number, private maxEntries = 500) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expires: Date.now() + this.ttlMs });
  }
}
