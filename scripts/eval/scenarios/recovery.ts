import type { EvalScenario } from "../types";

export const recoveryScenarios: EvalScenario[] = [
  {
    id: "RECOVER-01",
    category: "recovery",
    description: "Customer changes the service mid-flow with an explicit correction marker",
    turns: [
      "I want a cleaning",
      "yes",
      "Tuesday 2pm",
      "actually I want a filling instead",
      "Trevor 2428012847",
      "yes",
    ],
    expected: {
      outcome: "completed",
      intent: "book_appointment",
      actions: [
        { type: "request_appointment", payload: { service: "Basic filling", name: "Trevor" } },
      ],
    },
  },
  {
    id: "RECOVER-02",
    category: "recovery",
    description: "Customer changes the date mid-flow with an explicit correction marker",
    turns: [
      "I want a cleaning",
      "yes",
      "Tuesday 2pm",
      "actually make it Wednesday instead",
      "Trevor 2428012847",
      "yes",
    ],
    expected: {
      outcome: "completed",
      intent: "book_appointment",
      actions: [
        { type: "request_appointment", payload: { preferredDate: "Wednesday", name: "Trevor" } },
      ],
    },
    notes:
      'name MUST come from the final "Trevor 2428012847" message, not be pulled from the leftover text of the correction message itself.',
  },
  {
    id: "RECOVER-03",
    category: "recovery",
    description: "Customer changes the time mid-flow with an explicit correction marker",
    turns: ["I want a cleaning", "yes", "Tuesday 2pm", "actually 3pm", "Trevor 2428012847", "yes"],
    expected: {
      outcome: "completed",
      intent: "book_appointment",
      actions: [
        { type: "request_appointment", payload: { preferredTime: "15:00", name: "Trevor" } },
      ],
    },
    notes:
      'name MUST come from the final "Trevor 2428012847" message, not be pulled from the leftover text of the correction message itself.',
  },
  {
    id: "RECOVER-04",
    category: "recovery",
    description: "Customer abandons an in-progress booking",
    turns: ["I want a cleaning", "yes", "never mind"],
    expected: {
      outcome: "abandoned",
      finalState: {},
      prohibitedActions: ["request_appointment", "escalate"],
    },
  },
  {
    id: "RECOVER-05",
    category: "recovery",
    description:
      "Customer gives an ambiguous confirmation, is re-asked, then confirms and continues normally",
    turns: ["I want a cleaning", "meh, I guess", "yes", "Tuesday 2pm", "Trevor 2428012847", "yes"],
    expected: {
      outcome: "completed",
      intent: "book_appointment",
      actions: [{ type: "request_appointment", payload: { service: "Routine cleaning" } }],
    },
  },
];
