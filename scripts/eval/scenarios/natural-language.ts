import type { EvalScenario } from "../types";

export const naturalLanguageScenarios: EvalScenario[] = [
  {
    id: "NL-01",
    category: "natural_language",
    description: "Typos in both the service name and the weekday",
    turns: ["I want a cleening", "yes", "Tusday 2pm", "Trevor 2428012847", "yes"],
    expected: {
      outcome: "completed",
      intent: "book_appointment",
      actions: [{ type: "request_appointment", payload: { service: "Routine cleaning" } }],
    },
    notes:
      'A correctly typo-tolerant receptionist should still recognize "cleening"/"Tusday" — this is the expected, CORRECT behavior, not necessarily what the current substring-matching implementation achieves.',
  },
  {
    id: "NL-02",
    category: "natural_language",
    description: "Bahamian/texting shorthand for a weekday, combined with a time",
    turns: ["I want a cleaning", "yes", "mon 2pm", "Trevor 2428012847", "yes"],
    expected: {
      outcome: "completed",
      intent: "book_appointment",
      actions: [
        {
          type: "request_appointment",
          payload: { preferredDate: "Monday", preferredTime: "14:00" },
        },
      ],
    },
  },
  {
    id: "NL-03",
    category: "natural_language",
    description: "Casual phrasing for a service request",
    turns: ["yo I need a cleaning done", "yeah", "Tuesday 2pm", "Trevor 2428012847", "yes"],
    expected: {
      outcome: "completed",
      intent: "book_appointment",
      actions: [{ type: "request_appointment", payload: { service: "Routine cleaning" } }],
    },
  },
  {
    id: "NL-04",
    category: "natural_language",
    description: "Multiple fields volunteered in a single message, mid-flow",
    turns: ["I want a cleaning", "yes", "Trevor 2428012847 Tuesday 2pm", "yes"],
    expected: {
      outcome: "completed",
      intent: "book_appointment",
      actions: [
        {
          type: "request_appointment",
          payload: {
            name: "Trevor",
            phone: "+12428012847",
            preferredDate: "Tuesday",
            preferredTime: "14:00",
          },
        },
      ],
    },
  },
  {
    id: "NL-05",
    category: "natural_language",
    description: "Filler words around a service request",
    turns: [
      "um so basically I guess I want a cleaning",
      "yes please",
      "Tuesday 2pm",
      "Trevor 2428012847",
      "yes",
    ],
    expected: {
      outcome: "completed",
      intent: "book_appointment",
      actions: [{ type: "request_appointment", payload: { service: "Routine cleaning" } }],
    },
  },
  {
    id: "NL-06",
    category: "natural_language",
    description:
      "Ambiguous/garbage input with no active flow invents nothing — and escalates after repeated confusion (Objective 4) rather than looping forever",
    turns: ["lol", "fire ball", "asdkfj qwoeiru"],
    expected: {
      // "lol" is the first unclear turn; "fire ball" is the SECOND
      // consecutive one, so it escalates there — the third message
      // ("asdkfj qwoeiru") is never even reached as a fresh flow turn,
      // since handoffActive is already true by then. The safety property
      // this scenario actually tests — garbage input never invents a
      // booking/reschedule/cancellation — is unchanged; only the
      // "silently repeat the same question forever" behavior was fixed.
      outcome: "escalated",
      finalState: {},
      prohibitedActions: ["request_appointment", "request_reschedule", "request_cancellation"],
    },
  },
];
