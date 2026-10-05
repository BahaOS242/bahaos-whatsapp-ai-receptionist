import type { EvalScenario } from "../types";

export const reschedulingScenarios: EvalScenario[] = [
  {
    id: "RESCHED-01",
    category: "rescheduling",
    description: "Normal reschedule, full happy path",
    turns: ["I need to reschedule my appointment", "Wednesday 3pm", "Trevor 2428012847", "yes"],
    expected: {
      outcome: "completed",
      intent: "reschedule_appointment",
      actions: [
        {
          type: "request_reschedule",
          payload: {
            name: "Trevor",
            phone: "+12428012847",
            newPreferredDate: "Wednesday",
            newPreferredTime: "15:00",
          },
        },
      ],
    },
  },
  {
    id: "RESCHED-02",
    category: "rescheduling",
    description: "An invalid (closed-day) reschedule time is rejected immediately",
    turns: ["I need to reschedule my appointment", "Sunday 3pm"],
    expected: {
      outcome: "invalid",
      prohibitedActions: ["request_reschedule"],
    },
  },
  {
    id: "RESCHED-03",
    category: "rescheduling",
    description: "Correcting an invalid reschedule time completes normally",
    turns: [
      "I need to reschedule my appointment",
      "Tuesday 6pm",
      "Tuesday 3pm",
      "Trevor 2428012847",
      "yes",
    ],
    expected: {
      outcome: "completed",
      intent: "reschedule_appointment",
      actions: [
        {
          type: "request_reschedule",
          payload: { newPreferredDate: "Tuesday", newPreferredTime: "15:00" },
        },
      ],
    },
  },
];
