import { afterAll, beforeAll, vi } from "vitest";

/**
 * Clock fixture for tests whose EXPECTED VALUES are tied to a specific
 * calendar position.
 *
 * Those tests say things like "Sept 8 resolves to 2026-09-08" and book into
 * the clinic simulator's reference calendar (a fixed, immutable dataset
 * covering roughly Aug 2026 – Aug 2027). Month-name dates resolve to the
 * NEXT occurrence relative to the real "today", so these tests only ever
 * meant "…as of a day shortly before the calendar starts". Run against the
 * real clock they start failing the moment today passes September 8 — a
 * test-infrastructure problem, not a product bug (the production date
 * logic is deliberately real-clock and is left untouched).
 *
 * This pins ONLY `Date` (timers, promises and I/O stay real) to a fixed
 * instant for the duration of the calling test file, then restores it.
 * It changes no assertion and no expected value.
 */
export const PINNED_TEST_NOW = new Date("2026-08-20T15:00:00Z");

export function pinClockToReferenceCalendar(now: Date = PINNED_TEST_NOW): void {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"], now });
  });
  afterAll(() => {
    vi.useRealTimers();
  });
}
