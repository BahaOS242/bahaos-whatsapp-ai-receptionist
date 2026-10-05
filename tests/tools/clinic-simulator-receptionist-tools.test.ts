import { describe, expect, it } from "vitest";
import { createClinicSimulator } from "../../src/simulator/clinic-simulator";
import { createClinicSimulatorReceptionistTools } from "../../src/tools/clinic-simulator-receptionist-tools";
import { BAHAMAS_DENTAL_SERVICE } from "../../src/ai/business-context";

const CLEAN_MONDAY = "2026-08-31";

describe("createClinicSimulatorReceptionistTools", () => {
  it("books successfully against a genuinely open slot", async () => {
    const simulator = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const tools = createClinicSimulatorReceptionistTools(simulator);

    const result = await tools.requestAppointment({
      name: "Trevor",
      phone: "+12428012847",
      service: "Routine cleaning",
      preferredDate: CLEAN_MONDAY,
      preferredTime: "10:00",
    });

    expect(result).toEqual({ success: true, persisted: true });
    expect(simulator.checkBookable(CLEAN_MONDAY, "10:00", 60).ok).toBe(false);
  });

  it("REGRESSION (mission's own example): a genuine conflict never claims success, and provides real alternatives from the simulator", async () => {
    const simulator = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const tools = createClinicSimulatorReceptionistTools(simulator);

    // Seeded conflict: 2026-08-24 10:00 is already booked (consultation).
    const result = await tools.requestAppointment({
      name: "Trevor",
      phone: "+12428012847",
      service: "Basic filling",
      preferredDate: "2026-08-24",
      preferredTime: "10:00",
    });

    expect(result.success).toBe(false);
    expect(result.error).not.toMatch(/booked|confirmed/i); // never claims it was booked
    expect(result.recoverable?.reason).toBe("slot_conflict");
    expect(result.recoverable?.alternativeSlots?.length).toBeGreaterThan(0);
    // Every offered alternative is genuinely bookable.
    for (const slot of result.recoverable?.alternativeSlots ?? []) {
      expect(simulator.checkBookable(slot.date, slot.time, 45).ok).toBe(true);
    }
  });

  it("rejects an out-of-hours request deterministically (Root canal at 4 PM)", async () => {
    const simulator = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const tools = createClinicSimulatorReceptionistTools(simulator);

    const result = await tools.requestAppointment({
      name: "Trevor",
      phone: "+12428012847",
      service: "Root canal",
      preferredDate: CLEAN_MONDAY,
      preferredTime: "16:00",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/business hours/i);
  });

  it("cancellation finds and cancels the customer's soonest upcoming simulated booking", async () => {
    const simulator = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const tools = createClinicSimulatorReceptionistTools(simulator);

    await tools.requestAppointment({
      name: "Trevor",
      phone: "+12428012847",
      service: "Routine cleaning",
      preferredDate: CLEAN_MONDAY,
      preferredTime: "10:00",
    });

    const cancelled = await tools.requestCancellation({ name: "Trevor", phone: "+12428012847" });
    expect(cancelled).toEqual({ success: true, persisted: true });
    expect(simulator.checkBookable(CLEAN_MONDAY, "10:00", 60).ok).toBe(true);
  });

  it("cancelling with no existing booking fails honestly, never claims success", async () => {
    const simulator = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const tools = createClinicSimulatorReceptionistTools(simulator);
    const result = await tools.requestCancellation({ name: "Nobody", phone: "+19999999999" });
    expect(result.success).toBe(false);
  });

  it("reschedule moves the customer's soonest booking to the new time", async () => {
    const simulator = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const tools = createClinicSimulatorReceptionistTools(simulator);

    await tools.requestAppointment({
      name: "Trevor",
      phone: "+12428012847",
      service: "Routine cleaning",
      preferredDate: CLEAN_MONDAY,
      preferredTime: "10:00",
    });

    const rescheduled = await tools.requestReschedule({
      name: "Trevor",
      phone: "+12428012847",
      newPreferredDate: CLEAN_MONDAY,
      newPreferredTime: "13:00",
    });
    expect(rescheduled).toEqual({ success: true, persisted: true });
    expect(simulator.checkBookable(CLEAN_MONDAY, "10:00", 60).ok).toBe(true); // old slot freed
    expect(simulator.checkBookable(CLEAN_MONDAY, "13:00", 60).ok).toBe(false); // new slot occupied
  });

  it("a reschedule that would conflict is rejected and never claims success, real alternatives offered", async () => {
    const simulator = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const tools = createClinicSimulatorReceptionistTools(simulator);

    await tools.requestAppointment({
      name: "Trevor",
      phone: "+12428012847",
      service: "Routine cleaning",
      preferredDate: CLEAN_MONDAY,
      preferredTime: "10:00",
    });
    await tools.requestAppointment({
      name: "Someone Else",
      phone: "+12428019999",
      service: "Basic filling",
      preferredDate: CLEAN_MONDAY,
      preferredTime: "13:00",
    });

    const result = await tools.requestReschedule({
      name: "Trevor",
      phone: "+12428012847",
      newPreferredDate: CLEAN_MONDAY,
      newPreferredTime: "13:00",
    });
    expect(result.success).toBe(false);
    expect(result.recoverable?.reason).toBe("slot_conflict");
    // Trevor's original 10:00 appointment is untouched.
    expect(simulator.checkBookable(CLEAN_MONDAY, "10:00", 60).ok).toBe(false);
  });

  it("an unknown service name fails cleanly without ever touching the simulator", async () => {
    const simulator = createClinicSimulator(BAHAMAS_DENTAL_SERVICE);
    const tools = createClinicSimulatorReceptionistTools(simulator);
    const result = await tools.requestAppointment({
      name: "Trevor",
      phone: "+12428012847",
      service: "Not a real service",
      preferredDate: CLEAN_MONDAY,
      preferredTime: "10:00",
    });
    expect(result.success).toBe(false);
    expect(simulator.state.listActiveBookings()).toEqual([]);
  });
});
