import type { Case } from "./harness";
import type { Turn } from "../../tests/torture/helpers";

/**
 * FOCUSED set for R21/R22 and their variants (owner-approved re-run after the contrast/phone-correction fixes).
 * Strict oracle: after the correction turn the stored name/phone are EXACT; the correction turn makes ZERO booking
 * attempts (it is the last SETUP turn — the shared scorer hard-fails any booking attempt on a setup turn); a SEPARATE
 * approval turn then produces EXACTLY ONE booking whose payload carries the exact corrected name/phone. No retry approval.
 * SIMULATED tools only.
 */
export const FOCUSED_LABEL = "FOCUSED R21/R22 variants (new run; earlier failing evidence preserved)";
const BASE = ["I want a cleaning", "yes", "Tuesday 2pm"];
const strict = { approvals: ["yes"], expectBookings: "exactlyOne" as const };
const state = (want: { name: string; phone: string }) => (t: Turn) => [
  ...(t.bookingState.name === want.name ? [] : [`stored name ${JSON.stringify(t.bookingState.name)} != ${JSON.stringify(want.name)}`]),
  ...(t.bookingState.phone === want.phone ? [] : [`stored phone ${JSON.stringify(t.bookingState.phone)} != ${JSON.stringify(want.phone)}`]),
];
const nameCase = (id: string, fix: string): Case => ({
  id, setup: [...BASE, "Alicia 2425550100", fix], checkAfterSetup: { 4: state({ name: "Alisha", phone: "+12425550100" }) },
  expectPayload: { name: "Alisha", phone: "+12425550100", preferredTime: "14:00", service: "Routine cleaning" }, ...strict,
});
const phoneCase = (id: string, fix: string): Case => ({
  id, setup: [...BASE, "Trevor 2428012847", fix], checkAfterSetup: { 4: state({ name: "Trevor", phone: "+12428019999" }) },
  expectPayload: { name: "Trevor", phone: "+12428019999", preferredTime: "14:00", service: "Routine cleaning" }, ...strict,
});

export const FOCUSED_R21_R22: Case[] = [
  nameCase("F01 R21 It's Alisha, not Alicia", "It's Alisha, not Alicia"),
  nameCase("F02 yes, Alisha not Alicia", "yes, Alisha not Alicia"),
  nameCase("F03 curly It’s Alisha, not Alicia", "It’s Alisha, not Alicia"),
  nameCase("F04 yes, curly it’s Alisha, not Alicia", "yes, it’s Alisha, not Alicia"),
  nameCase("F05 Yes Alisha not Alicia", "Yes Alisha not Alicia"),
  phoneCase("F06 R22 wrong number, it's 2428019999", "wrong number, it's 2428019999"),
  phoneCase("F07 curly wrong number, it’s 2428019999", "wrong number, it’s 2428019999"),
  phoneCase("F08 bundled yes, wrong number, it's 2428019999", "yes, wrong number, it's 2428019999"),
  phoneCase("F09 bundled yes + curly", "yes, wrong number, it’s 2428019999"),
  phoneCase("F10 that’s the wrong phone number, 2428019999", "that’s the wrong phone number, 2428019999"),
];
