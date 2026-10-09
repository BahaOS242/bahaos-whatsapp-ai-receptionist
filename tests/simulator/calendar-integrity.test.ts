import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pinClockToReferenceCalendar } from "../helpers/pin-clock";
import { createClinicSimulator, type ClinicSimulator } from "../../src/simulator/clinic-simulator";
import { createClinicSimulatorReceptionistTools } from "../../src/tools/clinic-simulator-receptionist-tools";
import { ReceptionistAgent } from "../../src/ai/receptionist-agent";
import { DevRuleBasedAIProvider } from "../../src/ai/providers/dev-rule-based-provider";
import { ConversationManager } from "../../src/ai/conversation-manager";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";
import type { AIProviderRequest, ConversationTurn } from "../../src/ai/types";

// These tests' expectations are tied to the reference calendar (see tests/helpers/pin-clock.ts).
pinClockToReferenceCalendar();

/**
 * Section 16's own non-negotiable requirement, made concrete: running
 * EVERY kind of simulation operation — normal booking, cancellation,
 * reschedule, recurring booking, conflicts, concurrency, and a full
 * torture-style conversation battery — must NEVER modify the reference
 * calendar files. Proven by hashing every file in
 * test-data/clinic-calendar/ before and after, asserting the hashes are
 * byte-for-byte identical — not just "assumed" from the architecture
 * (adapter is read-only, state is a separate transaction log) alone.
 */

const CALENDAR_DIR = join(process.cwd(), "test-data", "clinic-calendar");
const FILES = ["clinic-calendar.json", "clinic-calendar.csv", "services.json", "README.md"];

function hashAllFiles(): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const file of FILES) {
    const content = readFileSync(join(CALENDAR_DIR, file));
    hashes[file] = createHash("sha256").update(content).digest("hex");
  }
  return hashes;
}

function checkAvailabilityFor(simulator: ClinicSimulator): AIProviderRequest["checkAvailability"] {
  return (date, time, duration) => simulator.checkBookable(date, time, duration);
}

describe("Reference calendar integrity — must NEVER be mutated by any simulation operation", () => {
  it("hashes are identical before and after low-level simulator operations (booking, cancellation, reschedule, conflicts, out-of-range)", () => {
    const before = hashAllFiles();

    const sim = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);

    sim.checkBookable("2026-08-24", "09:00", 30);
    sim.checkBookable("2026-08-24", "10:00", 30); // known seeded conflict
    sim.checkBookable("2099-01-01", "09:00", 30); // out of range
    sim.findNextAvailable("2026-08-24", "09:00", 60, 10);

    const b1 = sim.book("2026-08-25", "09:00", "cleaning", 60, "Trevor", "+12428012847");
    const b2 = sim.book("2026-08-25", "09:00", "cleaning", 60, "Someone Else", "+12428019999"); // conflict, rejected
    expect(b1.ok).toBe(true);
    expect(b2.ok).toBe(false);

    if (b1.ok) sim.cancel(b1.booking.id);

    const b3 = sim.book("2026-08-26", "09:00", "filling", 45, "Trevor", "+12428012847");
    if (b3.ok) sim.reschedule(b3.booking.id, "2026-08-27", "10:00", 45);

    for (let i = 0; i < 12; i++) {
      sim.book(`2026-09-${String(10 + i).padStart(2, "0")}`, "10:00", "cleaning", 60, "Recurring Customer", "+12428010000");
    }

    // The gap-in-raw-data case: 90-minute root canal at 2026-08-24 11:00
    // only marks its OWN start row "booked" in the raw file.
    expect(sim.checkBookable("2026-08-24", "11:30", 30).ok).toBe(false);
    expect(sim.checkBookable("2026-08-24", "12:00", 30).ok).toBe(false);

    expect(hashAllFiles()).toEqual(before);
  });

  it("hashes are identical after a REAL recurring booking via the full ReceptionistAgent + tools pipeline", async () => {
    const before = hashAllFiles();

    const simulator = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const tools = createClinicSimulatorReceptionistTools(simulator);
    const agent = new ReceptionistAgent(new DevRuleBasedAIProvider(), tools);
    const checkAvailability = checkAvailabilityFor(simulator);
    const cm = new ConversationManager();
    const history: ConversationTurn[] = [];

    const runTurn = async (message: string) => {
      const req = cm.buildRequest({ business: BAHAMAS_DENTAL_SERVICE, customer: {}, history, message, checkAvailability });
      const result = await agent.handleMessage(req);
      history.push({ role: "customer", content: message }, { role: "assistant", content: result.reply });
      cm.setBookingState(result.bookingState);
      return result;
    };

    await runTurn("I need a cleaning every 3 months");
    await runTurn("Sept 1 at 9am");
    await runTurn("trevor 2428012847");
    const confirmed = await runTurn("yes");
    expect(confirmed.actionsTaken.some((a) => a.result.success)).toBe(true);
    expect(simulator.state.listActiveBookings().length).toBeGreaterThan(0);

    expect(hashAllFiles()).toEqual(before);
  });

  it("hashes are identical after concurrent double-booking attempts on the same slot", async () => {
    const before = hashAllFiles();

    const simulator = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const tools = createClinicSimulatorReceptionistTools(simulator);

    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        tools.requestAppointment({
          name: `Customer ${i}`,
          phone: `+1242801000${i}`,
          service: "Routine cleaning",
          preferredDate: "2026-09-21",
          preferredTime: "10:00",
        }),
      ),
    );

    expect(hashAllFiles()).toEqual(before);
  });

  it("hashes are identical after a full torture-style multi-turn conversation battery (corrections, topic switching, ambiguity, recurring, conflicts)", async () => {
    const before = hashAllFiles();

    const simulator = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const tools = createClinicSimulatorReceptionistTools(simulator);
    const agent = new ReceptionistAgent(new DevRuleBasedAIProvider(), tools);
    const checkAvailability = checkAvailabilityFor(simulator);
    const cm = new ConversationManager();
    const history: ConversationTurn[] = [];

    const messages = [
      "how much is a cleaning or a filling?", // ambiguity — never guesses
      "book a root canal",
      "actually a cleaning",
      "Sept 22 at 2pm",
      "actually make it 3pm",
      "what are your hours?", // topic switch
      "trevor 2428012847",
      "no",
      "a filling",
      "yes",
      "I need a cleaning every 3 months", // fresh recurring flow
      "Sept 1 at 9am",
      "trevor 2428012847",
      "yes",
    ];
    for (const message of messages) {
      const req = cm.buildRequest({ business: BAHAMAS_DENTAL_SERVICE, customer: {}, history, message, checkAvailability });
      const result = await agent.handleMessage(req);
      history.push({ role: "customer", content: message }, { role: "assistant", content: result.reply });
      cm.setBookingState(result.bookingState);
    }

    expect(hashAllFiles()).toEqual(before);
  });
});
