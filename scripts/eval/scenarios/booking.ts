import type { EvalScenario } from "../types";

export const bookingScenarios: EvalScenario[] = [
  {
    id: "BOOK-01",
    category: "booking",
    description: "Normal booking, full happy path",
    turns: ["I want a cleaning", "yes", "Tuesday 2pm", "Trevor 2428012847", "yes"],
    expected: {
      outcome: "completed",
      intent: "book_appointment",
      finalState: {},
      actions: [
        {
          type: "request_appointment",
          payload: {
            name: "Trevor",
            phone: "+12428012847",
            service: "Routine cleaning",
            preferredDate: "Tuesday",
            preferredTime: "14:00",
          },
        },
      ],
    },
  },
  {
    id: "BOOK-02",
    category: "booking",
    description: "Service selection via explicit book intent, stops mid-flow",
    turns: ["I'd like to book an appointment", "filling"],
    expected: {
      outcome: "unresolved",
      finalState: { intent: "book_appointment", service: "Basic filling" },
      prohibitedActions: ["request_appointment"],
    },
  },
  {
    id: "BOOK-03",
    category: "booking",
    description: "Date and time supplied as separate messages",
    turns: ["I want a cleaning", "yes", "Tuesday", "2pm", "Trevor 2428012847", "yes"],
    expected: {
      outcome: "completed",
      intent: "book_appointment",
      actions: [
        {
          type: "request_appointment",
          payload: { preferredDate: "Tuesday", preferredTime: "14:00" },
        },
      ],
    },
  },
  {
    id: "BOOK-04",
    category: "booking",
    description: "Date and time supplied together in one message",
    turns: [
      "I'd like to book an appointment",
      "filling",
      "Wednesday 10am",
      "Trevor 2428012847",
      "yes",
    ],
    expected: {
      outcome: "completed",
      intent: "book_appointment",
      actions: [
        {
          type: "request_appointment",
          payload: {
            service: "Basic filling",
            preferredDate: "Wednesday",
            preferredTime: "10:00",
          },
        },
      ],
    },
  },
  {
    id: "BOOK-05",
    category: "booking",
    description: "Name + phone supplied out of order, before date/time",
    turns: ["I want a cleaning", "yes", "Trevor 2428012847", "Tuesday 2pm", "yes"],
    expected: {
      outcome: "completed",
      intent: "book_appointment",
      actions: [
        {
          type: "request_appointment",
          payload: { name: "Trevor", phone: "+12428012847" },
        },
      ],
    },
  },
  {
    id: "BOOK-06",
    category: "booking",
    description: "An incomplete/malformed phone number is not accepted; a valid one afterward is",
    turns: ["I want a cleaning", "yes", "Tuesday 2pm", "Trevor", "24280128", "2428012847", "yes"],
    expected: {
      outcome: "completed",
      intent: "book_appointment",
      actions: [
        {
          type: "request_appointment",
          payload: { phone: "+12428012847" },
        },
      ],
    },
    notes:
      '"24280128" is 8 digits — not a recognized NANP shape (7/10/11) — so it must be silently rejected, not misread as a valid or partial number.',
  },
  {
    id: "BOOK-07",
    category: "booking",
    description: "An ambiguous bare hour with no am/pm is never accepted as a time",
    turns: ["I want a cleaning", "yes", "Tuesday 6"],
    expected: {
      outcome: "unresolved",
      finalState: { intent: "book_appointment", service: "Routine cleaning", date: "Tuesday" },
      prohibitedActions: ["request_appointment"],
    },
  },
  {
    id: "BOOK-08",
    category: "booking",
    description: "A bare hour is completed by a follow-up am/pm-only reply",
    turns: ["I want a cleaning", "yes", "Tuesday at 9", "am", "Trevor 2428012847", "yes"],
    expected: {
      outcome: "completed",
      intent: "book_appointment",
      actions: [
        {
          type: "request_appointment",
          payload: { preferredDate: "Tuesday", preferredTime: "09:00" },
        },
      ],
    },
  },
  {
    id: "BOOK-09",
    category: "booking",
    description: "Correcting an after-hours time with a valid one completes normally",
    turns: ["I want a cleaning", "yes", "Tuesday 6pm", "Tuesday 3pm", "Trevor 2428012847", "yes"],
    expected: {
      outcome: "completed",
      intent: "book_appointment",
      actions: [
        {
          type: "request_appointment",
          payload: { preferredDate: "Tuesday", preferredTime: "15:00" },
        },
      ],
    },
  },
  {
    id: "BOOK-10",
    category: "booking",
    description: "A closed-day request (Sunday) is rejected immediately",
    turns: ["I want a cleaning", "yes", "Sunday at 3pm"],
    expected: {
      outcome: "invalid",
      finalState: { intent: "book_appointment", service: "Routine cleaning" },
      prohibitedActions: ["request_appointment"],
    },
  },
  {
    id: "BOOK-11",
    category: "booking",
    description: "An after-hours request (6pm, closes 5pm) is rejected immediately",
    turns: ["I want a cleaning", "yes", "Tuesday 6pm"],
    expected: {
      outcome: "invalid",
      finalState: { intent: "book_appointment", service: "Routine cleaning" },
      prohibitedActions: ["request_appointment"],
    },
  },
  {
    id: "BOOK-12",
    category: "booking",
    description: "Exactly opening time (9 AM) is a valid start",
    turns: ["I want a cleaning", "yes", "Tuesday 9am", "Trevor 2428012847", "yes"],
    expected: {
      outcome: "completed",
      intent: "book_appointment",
      actions: [
        {
          type: "request_appointment",
          payload: { preferredDate: "Tuesday", preferredTime: "09:00" },
        },
      ],
    },
  },
  {
    id: "BOOK-13",
    category: "booking",
    description:
      "Exactly closing time (5 PM) is rejected as a start for any positive-duration service",
    turns: ["I want a cleaning", "yes", "Tuesday 5pm"],
    expected: {
      outcome: "invalid",
      prohibitedActions: ["request_appointment"],
    },
  },
];
