import { google } from "googleapis";
import type { calendar_v3 } from "googleapis";
import type {
  BusyInterval,
  CalendarClient,
  CalendarEvent,
  CalendarEventInput,
} from "./calendar-client";

/**
 * The only file in this codebase that imports `googleapis`. Everything
 * above this (the tools factory, ReceptionistAgent, both AIProviders)
 * depends only on the CalendarClient interface.
 */
export class GoogleCalendarClient implements CalendarClient {
  private readonly calendar: calendar_v3.Calendar;
  private readonly calendarId: string;

  constructor(params: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    calendarId: string;
  }) {
    const auth = new google.auth.OAuth2(params.clientId, params.clientSecret);
    auth.setCredentials({ refresh_token: params.refreshToken });
    this.calendar = google.calendar({ version: "v3", auth });
    this.calendarId = params.calendarId;
  }

  async listBusyTimes(
    startDateTime: string,
    endDateTime: string,
    timeZone: string,
  ): Promise<BusyInterval[]> {
    const response = await this.calendar.freebusy.query({
      requestBody: {
        timeMin: startDateTime,
        timeMax: endDateTime,
        timeZone,
        items: [{ id: this.calendarId }],
      },
    });
    const busy = response.data.calendars?.[this.calendarId]?.busy ?? [];
    return busy
      .filter((b): b is { start: string; end: string } => Boolean(b.start && b.end))
      .map((b) => ({ startDateTime: b.start, endDateTime: b.end }));
  }

  async createEvent(input: CalendarEventInput): Promise<CalendarEvent> {
    const response = await this.calendar.events.insert({
      calendarId: this.calendarId,
      requestBody: toEventRequestBody(input),
    });
    return toCalendarEvent(response.data, input);
  }

  async updateEvent(eventId: string, input: CalendarEventInput): Promise<CalendarEvent> {
    const response = await this.calendar.events.update({
      calendarId: this.calendarId,
      eventId,
      requestBody: toEventRequestBody(input),
    });
    return toCalendarEvent(response.data, input);
  }

  async deleteEvent(eventId: string): Promise<void> {
    await this.calendar.events.delete({ calendarId: this.calendarId, eventId });
  }
}

function toEventRequestBody(input: CalendarEventInput): calendar_v3.Schema$Event {
  return {
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.startDateTime, timeZone: input.timeZone },
    end: { dateTime: input.endDateTime, timeZone: input.timeZone },
  };
}

function toCalendarEvent(data: calendar_v3.Schema$Event, input: CalendarEventInput): CalendarEvent {
  if (!data.id) {
    throw new Error("Google Calendar did not return an event id.");
  }
  return { id: data.id, startDateTime: input.startDateTime, endDateTime: input.endDateTime };
}
