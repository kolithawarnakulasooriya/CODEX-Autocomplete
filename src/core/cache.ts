interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private readonly values = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly maxEntries = 100,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): T | undefined {
    const entry = this.values.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= this.now()) {
      this.values.delete(key);
      return undefined;
    }
    this.values.delete(key);
    this.values.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    if (ttlMs <= 0) {
      return;
    }
    this.values.delete(key);
    this.values.set(key, { value, expiresAt: this.now() + ttlMs });
    while (this.values.size > this.maxEntries) {
      const oldest = this.values.keys().next().value as string | undefined;
      if (oldest === undefined) {
        break;
      }
      this.values.delete(oldest);
    }
  }

  clear(): void {
    this.values.clear();
  }
}
