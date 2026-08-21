import type { BusinessContext } from "./types";

/**
 * Demo tenant configuration, matching the "Demo Practice Configuration"
 * section of PROJECT_CONTEXT.md exactly — not new/invented business info.
 * All prices/policies here are documented demo placeholders, not real
 * pricing or clinical advice (see PROJECT_CONTEXT.md).
 */
export const BAHAMAS_DENTAL_SERVICE: BusinessContext = {
  name: "Bahamas Dental Service",
  timezone: "America/Nassau",
  address: "Shirley St., Nassau, The Bahamas",
  hours: "Monday–Friday, 9:00 AM–5:00 PM (local time)",
  weeklyHours: {
    Sunday: null,
    Monday: { open: "09:00", close: "17:00" },
    Tuesday: { open: "09:00", close: "17:00" },
    Wednesday: { open: "09:00", close: "17:00" },
    Thursday: { open: "09:00", close: "17:00" },
    Friday: { open: "09:00", close: "17:00" },
    Saturday: null,
  },
  areaCode: "242",
  services: [
    {
      id: "consultation",
      name: "Dental consultation / basic exam",
      durationMinutes: 30,
      priceLabel: "B$75",
    },
    { id: "cleaning", name: "Routine cleaning", durationMinutes: 60, priceLabel: "B$125" },
    { id: "filling", name: "Basic filling", durationMinutes: 45, priceLabel: "B$175" },
    { id: "root_canal", name: "Root canal", durationMinutes: 90, priceLabel: "B$950" },
  ],
  policies: {
    insurance:
      "Coverage varies by plan; our front desk team verifies specific benefits before a visit.",
    newPatientInfo: "New patients are welcome and can request a consultation to get started.",
    cancellationCutoffHours: 2,
    emergencyPolicy:
      "Emergency requests are handed to staff rather than booked automatically — flag it as urgent so the team can call back promptly.",
  },
  escalationHandoffMessage:
    "Thanks for reaching out to Bahamas Dental Service. A member of our team will review your message and get back to you as soon as possible.",
};
