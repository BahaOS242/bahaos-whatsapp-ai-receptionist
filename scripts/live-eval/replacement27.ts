import type { Case } from "./harness";

/**
 * REPLACEMENT-27 — a clearly labelled REPLACEMENT corpus. It is NOT the original 27-conversation set
 * behind the historical "14/27" report (those transcripts were never recovered, and that result has NOT
 * been rerun). Authored from the categories in TEST_FINDINGS.md. Same scorer and safety rules as the
 * corrected-15 set; expected-but-missing bookings are SOFT shortfalls (findings), wrong data or an early
 * booking are HARD failures.
 *
 * Business clock: Fri 2026-10-09T16:00Z unless a case sets another (Mon 2026-10-12 where "tomorrow" must be open).
 */
export const REPLACEMENT_27_LABEL = "REPLACEMENT-27 (not the original; historical 14/27 report is unrecovered and not rerun)";
const MON = "2026-10-12T16:00:00Z";
const std = { approvals: ["yes"], retryApproval: true, expectBookings: "exactlyOne" as const };
const BOOK = ["I want a cleaning", "yes"];
const who = "Trevor 2428012847";
const p = (time: string, extra: { date?: string; name?: string; service?: string; phone?: string } = {}) => ({ name: extra.name ?? "Trevor", preferredTime: time, ...(extra.date ? { preferredDate: extra.date } : {}), ...(extra.service ? { service: extra.service } : {}), ...(extra.phone ? { phone: extra.phone } : {}) });

export const REPLACEMENT_27: Case[] = [
  // ---- natural time formats ×5 ----
  { id: "R01 time '3 pm'", setup: [...BOOK, "Tuesday 3 pm", who], expectPayload: p("15:00"), ...std },
  { id: "R02 time '15:00'", setup: [...BOOK, "Tuesday at 15:00", who], expectPayload: p("15:00"), ...std },
  { id: "R03 time 'noon'", setup: [...BOOK, "Wednesday at noon", who], expectPayload: p("12:00"), ...std },
  { id: "R04 time '2:30pm'", setup: [...BOOK, "Thursday at 2:30pm", who], expectPayload: p("14:30"), ...std },
  { id: "R05 time '9am'", setup: [...BOOK, "Tuesday 9am", who], expectPayload: p("09:00"), ...std },
  // ---- ISO / 24-hour dates ×3 ----
  { id: "R06 ISO date + 24h", setup: [...BOOK, "2026-10-14 at 10:00", who], expectPayload: p("10:00", { date: "2026-10-14" }), ...std },
  { id: "R07 'October 14 at 10am'", setup: [...BOOK, "October 14 at 10am", who], expectPayload: p("10:00", { date: "2026-10-14" }), ...std },
  { id: "R08 'Oct 20th 14:00'", setup: [...BOOK, "Oct 20th 14:00", who], expectPayload: p("14:00", { date: "2026-10-20" }), ...std },
  // ---- service typos ×3 (NL-01 overlap: a shortfall is expected and is a finding, a WRONG service is hard) ----
  { id: "R09 typo 'clening'", setup: ["I need a clening", "yes", "Tuesday 2pm", who], expectPayload: p("14:00", { service: "Routine cleaning" }), ...std },
  { id: "R10 typo 'fillin'", setup: ["I need a fillin", "yes", "Tuesday 2pm", who], expectPayload: p("14:00", { service: "Basic filling" }), ...std },
  { id: "R11 typo 'rootcanal'", setup: ["I need a rootcanal", "yes", "Tuesday 10am", who], expectPayload: p("10:00", { service: "Root canal" }), ...std },
  // ---- Bahamian dialect ×4 ----
  { id: "R12 dialect 'wanna'", setup: ["Hey I wanna book a cleanin", "yes", "Tuesday at 2 in the afternoon", "Dwayne 2425550123"], expectPayload: p("14:00", { name: "Dwayne" }), ...std },
  { id: "R13 dialect 'tryna'", setup: ["Hi I tryna book a cleaning", "yes", "Wednesday mornin 10", "my name is Shantell 242 555 0188"], expectPayload: p("10:00", { name: "Shantell" }), ...std },
  { id: "R14 dialect 'tmrw' (Mon clock)", clock: MON, setup: ["gimme a cleaning", "yes", "tmrw 3pm", "Dwayne 2425550123"], expectPayload: p("15:00", { name: "Dwayne", date: "2026-10-13" }), ...std },
  { id: "R15 dialect approval 'yeah man'", setup: [...BOOK, "Tuesday 2pm", who], approvals: ["yeah man"], retryApproval: true, expectBookings: "exactlyOne", expectPayload: p("14:00") },
  // ---- appointment inquiry ×2 (must NOT start a booking) ----
  { id: "R16 inquiry: what time is my appointment", setup: ["What time is my appointment?"], approvals: [], expectBookings: 0 },
  { id: "R17 inquiry: when is my cleaning", setup: ["Can you check when my cleaning is?"], approvals: [], expectBookings: 0 },
  // ---- repeated YES ×2 ----
  { id: "R18 triple yes", setup: [...BOOK, "Tuesday 2pm", who], approvals: ["yes", "yes", "yes"], expectBookings: "exactlyOne", expectPayload: p("14:00") },
  { id: "R19 'yeah' then 'yes'", setup: [...BOOK, "Tuesday 2pm", who], approvals: ["yeah", "yes"], expectBookings: "exactlyOne", expectPayload: p("14:00") },
  // ---- identity / detail corrections ×4 ----
  { id: "R20 'my name is actually Trevon'", setup: [...BOOK, "Tuesday 2pm", who, "my name is actually Trevon"], checkAfterSetup: { 4: (t) => (t.bookingState.name === "Trevon" ? [] : [`name ${JSON.stringify(t.bookingState.name)} != Trevon`]) }, expectPayload: p("14:00", { name: "Trevon" }), ...std },
  { id: "R21 'It's Alisha, not Alicia'", setup: [...BOOK, "Tuesday 2pm", "Alicia 2425550100", "It's Alisha, not Alicia"], checkAfterSetup: { 4: (t) => (t.bookingState.name === "Alisha" ? [] : [`name ${JSON.stringify(t.bookingState.name)} != Alisha`]) }, expectPayload: p("14:00", { name: "Alisha" }), ...std },
  { id: "R22 phone correction", setup: [...BOOK, "Tuesday 2pm", who, "wrong number, it's 2428019999"], checkAfterSetup: { 4: (t) => (t.bookingState.phone === "+12428019999" ? [] : [`phone ${t.bookingState.phone} != +12428019999`]) }, expectPayload: p("14:00", { phone: "+12428019999" }), ...std },
  { id: "R23 service change after details", setup: [...BOOK, "Tuesday 2pm", who, "actually make it a filling"], expectPayload: p("14:00", { service: "Basic filling" }), ...std },
  // ---- next-week qualifiers ×4 ----
  { id: "R24 next week Tuesday 10am", setup: [...BOOK, "next week Tuesday at 10am", who], checkAfterSetup: { 2: (t) => (t.bookingState.date === "2026-10-13" ? [] : [`date ${t.bookingState.date} != 2026-10-13`]) }, expectPayload: p("10:00", { date: "2026-10-13" }), ...std },
  { id: "R25 Wednesday next week 3pm", setup: [...BOOK, "Wednesday next week at 3pm", who], checkAfterSetup: { 2: (t) => (t.bookingState.date === "2026-10-14" ? [] : [`date ${t.bookingState.date} != 2026-10-14`]) }, expectPayload: p("15:00", { date: "2026-10-14" }), ...std },
  { id: "R26 Mon clock: next week Thursday 11am", clock: MON, setup: [...BOOK, "next week Thursday at 11am", who], checkAfterSetup: { 2: (t) => (t.bookingState.date === "2026-10-22" ? [] : [`date ${t.bookingState.date} != 2026-10-22`]) }, expectPayload: p("11:00", { date: "2026-10-22" }), ...std },
  { id: "R27 'sometime next week' must ask for a day", setup: [...BOOK, "sometime next week"], approvals: [], expectBookings: 0 },
];
