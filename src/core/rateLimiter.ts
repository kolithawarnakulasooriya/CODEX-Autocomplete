export class SlidingWindowRateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  tryAcquire(): boolean {
    const cutoff = this.now() - this.windowMs;
    this.timestamps = this.timestamps.filter((timestamp) => timestamp > cutoff);
    if (this.timestamps.length >= Math.max(1, this.limit)) {
      return false;
    }
    this.timestamps.push(this.now());
    return true;
  }

  clear(): void {
    this.timestamps = [];
  }
}
