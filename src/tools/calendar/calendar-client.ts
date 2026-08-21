/**
 * Minimal abstraction over "check and reserve time on a calendar."
 * GoogleCalendarReceptionistTools depends on this interface, not on the
 * `googleapis` SDK directly — that's what makes it testable with a fake
 * client and no network access. GoogleCalendarClient
 * (google-calendar-client.ts) is the only file in this codebase that
 * imports `googleapis`.
 */

export interface CalendarEventInput {
  summary: string;
  description?: string;
  /** Naive local datetime, no offset — e.g. "2026-08-25T14:00:00". */
  startDateTime: string;
  endDateTime: string;
  /** IANA timezone, e.g. "America/Nassau" — paired with the naive
   * datetimes above; Google Calendar does the DST-aware conversion. */
  timeZone: string;
}

export interface CalendarEvent {
  id: string;
  startDateTime: string;
  endDateTime: string;
}

export interface BusyInterval {
  startDateTime: string;
  endDateTime: string;
}

export interface CalendarClient {
  /** Busy intervals overlapping [startDateTime, endDateTime) — the
   * source of truth for "is this slot actually free," independent of
   * the local business-hours check. */
  listBusyTimes(
    startDateTime: string,
    endDateTime: string,
    timeZone: string,
  ): Promise<BusyInterval[]>;
  createEvent(input: CalendarEventInput): Promise<CalendarEvent>;
  updateEvent(eventId: string, input: CalendarEventInput): Promise<CalendarEvent>;
  deleteEvent(eventId: string): Promise<void>;
}
