/**
 * In-process, per-key async mutex. Not distributed locking — this only
 * serializes concurrent calls within a single Node process, which is the
 * explicitly agreed scope for this single-tenant demo (Google Calendar
 * itself remains the cross-process/external availability source of
 * truth; this just prevents two requests inside *this* process from both
 * racing past the same availability check for the same slot).
 */
export class SlotLock {
  private readonly queue = new Map<string, Promise<void>>();

  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prior = this.queue.get(key) ?? Promise.resolve();
    let releaseNext!: () => void;
    const next = new Promise<void>((resolve) => {
      releaseNext = resolve;
    });
    this.queue.set(
      key,
      prior.then(() => next),
    );

    await prior;
    try {
      return await fn();
    } finally {
      releaseNext();
    }
  }
}
