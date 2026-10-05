import type { EvalScenario } from "../types";

export const faqScenarios: EvalScenario[] = [
  {
    id: "FAQ-01",
    category: "faq",
    description: "Hours FAQ asked mid-booking does not derail the booking",
    turns: [
      "I want a cleaning",
      "yes",
      "what are your hours?",
      "Tuesday 2pm",
      "Trevor 2428012847",
      "yes",
    ],
    expected: {
      outcome: "completed",
      intent: "book_appointment",
      actions: [
        {
          type: "request_appointment",
          payload: { service: "Routine cleaning", preferredDate: "Tuesday" },
        },
      ],
    },
  },
  {
    id: "FAQ-02",
    category: "faq",
    description:
      "Price FAQ about a DIFFERENT service mid-booking answers about that service without switching what's booked",
    turns: [
      "I want a cleaning",
      "yes",
      "how much is a filling?",
      "Tuesday 2pm",
      "Trevor 2428012847",
      "yes",
    ],
    expected: {
      outcome: "completed",
      intent: "book_appointment",
      actions: [{ type: "request_appointment", payload: { service: "Routine cleaning" } }],
    },
    notes:
      "Regression coverage for ROOT CAUSE #1/#7 — the price question must not silently switch the service.",
  },
  {
    id: "FAQ-03",
    category: "faq",
    description: "Services-list FAQ mid-booking does not derail the booking",
    turns: [
      "I want a cleaning",
      "yes",
      "what services do you offer?",
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
    id: "FAQ-04",
    category: "faq",
    description:
      "A standalone FAQ before any booking intent, followed by a fresh booking, completes normally",
    turns: [
      "what are your hours?",
      "I want a cleaning",
      "yes",
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
];
