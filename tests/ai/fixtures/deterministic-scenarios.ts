import { BAHAMAS_DENTAL_SERVICE } from "../../../src/ai/business-context";
import type { BusinessContext } from "../../../src/ai/types";

/**
 * The single source of truth for the "deterministic 10" scenario corpus —
 * the exact customer message sequences (and any non-default business
 * fixture) used both by tests/ai/deterministic-scenario-eval.test.ts
 * (scripted model, no network) and scripts/eval-llm-comparison (real
 * Anthropic/OpenRouter models, no scripting). Keeping the raw customer
 * inputs in one place is what makes the two harnesses comparable at all:
 * a live run and the scripted regression are proven to receive byte-for-
 * byte identical customer messages, so any behavioral difference between
 * them is attributable to the model, not to a corpus that quietly drifted
 * apart between two copies.
 *
 * Deliberately holds ONLY the customer-facing inputs (messages, business
 * context) — NOT scripted model responses (those are specific to the
 * no-network unit test) and NOT pass/fail expectations (those are
 * specific to each harness's own grading approach, since a scripted run
 * can assert exact state while a live run against a non-deterministic
 * model needs more tolerant invariant checks).
 */
export interface DeterministicScenario {
  id: number;
  title: string;
  messages: string[];
  /** Defaults to BAHAMAS_DENTAL_SERVICE when omitted. */
  business?: BusinessContext;
}

export const HELD_SLOT_BUSINESS: BusinessContext = {
  ...BAHAMAS_DENTAL_SERVICE,
  unavailableSlots: [{ date: "Tuesday", time: "14:00" }],
};

export const DETERMINISTIC_SCENARIOS: DeterministicScenario[] = [
  {
    id: 1,
    title: "Normal booking",
    messages: ["I'd like to book an appointment", "Routine cleaning", "Tuesday 2pm", "Trevor, 2428012847", "yes"],
  },
  {
    id: 2,
    title: "Information supplied out of order",
    messages: [
      "Hi, my name is Sarah and my number is 2428012847",
      "I'd like to book a filling",
      "how about Wednesday at 11am",
    ],
  },
  {
    id: 3,
    title: "Garbage/invalid responses + decline",
    messages: ["I want to book something", "asdkjfh??", "cleaning", "lol idk", "Tuesday 3pm", "Trevor 2428012847", "no"],
  },
  {
    id: 4,
    title: "Date correction",
    messages: ["I want a cleaning", "Tuesday 2pm", "Trevor 2428012847", "actually can we do Wednesday instead"],
  },
  {
    id: 5,
    title: "Time correction",
    messages: ["I want a cleaning", "Tuesday 2pm", "Trevor 2428012847", "actually make it 3pm not 2pm"],
  },
  {
    id: 6,
    title: "FAQ during an active booking",
    messages: ["I want to book a filling", "What's the price?", "Tuesday 10am", "Trevor 2428012847"],
  },
  {
    id: 7,
    title: "Unavailable slot and alternatives",
    // Trailing "yes" required since the application-enforced confirmation
    // gate (Objective 2) means even a corrected time never books itself —
    // the customer must explicitly confirm the NEW time, same as any
    // other booking.
    messages: ["I want a cleaning", "Tuesday 2pm", "Trevor 2428012847", "9am", "yes"],
    business: HELD_SLOT_BUSINESS,
  },
  {
    id: 8,
    title: "Out-of-hours time",
    // Trailing "yes" required for the same reason — once every field is
    // known (after the retry), the application still requires an
    // explicit confirmation turn before booking.
    messages: ["I want a filling", "Tuesday 6pm", "Tuesday 3pm", "Trevor 2428012847", "yes"],
  },
  {
    id: 9,
    title: "Escalation",
    messages: ["I want to book a cleaning", "actually can I just talk to a person"],
  },
  {
    id: 10,
    title: "Messy conversation with interruptions",
    messages: [
      "hii i need to get my teeth cleaned lol",
      "just a regular cleaning please",
      "umm how much does that cost",
      "ok sounds good, tuesday at 2pm works for me",
      "its trevor, my numbers 2428012847",
      "yes",
    ],
  },
];
