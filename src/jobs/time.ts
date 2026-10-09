/**
 * Business-local wall time -> UTC instant. Job execution is always a UTC
 * instant; this is for callers who think in a tenant's local time.
 *
 * DST policy (documented, tested):
 *  - a local time that does NOT exist (spring-forward gap) resolves to the
 *    instant just after the gap (02:30 -> 03:30 local);
 *  - a local time that occurs TWICE (fall-back) resolves to the FIRST occurrence.
 */
function offsetMs(timeZone: string, instantMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instantMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const wallAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wallAsUtc - Math.floor(instantMs / 1000) * 1000;
}

export function localTimeToUtc(timeZone: string, local: { year: number; month: number; day: number; hour: number; minute: number }): Date {
  const wall = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, 0);
  if (!Number.isFinite(wall)) throw new RangeError("invalid local time");
  const day = 24 * 3600 * 1000;
  const before = offsetMs(timeZone, wall - day);
  const after = offsetMs(timeZone, wall + day);
  const candidates = [...new Set([before, after])].map((o) => wall - o);
  // keep only candidates whose own offset reproduces the wall time (a real local time)
  const exact = candidates.filter((c) => c + offsetMs(timeZone, c) === wall);
  if (exact.length > 0) return new Date(Math.min(...exact));
  return new Date(wall - before); // gap: use the pre-transition offset => lands just after the gap
}
