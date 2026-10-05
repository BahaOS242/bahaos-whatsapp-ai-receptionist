import type { EvalScenario } from "../types";

export const escalationScenarios: EvalScenario[] = [
  {
    id: "ESC-01",
    category: "escalation",
    description: "An explicit request for a human escalates",
    turns: ["I want to talk to someone"],
    expected: {
      outcome: "escalated",
      actions: [{ type: "escalate", success: true }],
    },
  },
  {
    id: "ESC-02",
    category: "escalation",
    description:
      "Escalation mid-booking, followed by a continued booking attempt — automation stays blocked",
    turns: [
      "I want a cleaning",
      "yes",
      "I want to talk to someone",
      "Tuesday 2pm",
      "Trevor 2428012847",
    ],
    expected: {
      outcome: "escalated",
      actions: [{ type: "escalate", success: true }],
      prohibitedActions: ["request_appointment"],
    },
  },
  {
    id: "ESC-03",
    category: "escalation",
    description:
      'Escalation followed by "never mind" — the handoff (not the abandonment intent) governs the reply, since automation is blocked before the provider even runs',
    turns: ["I want to talk to someone", "never mind"],
    expected: {
      outcome: "escalated",
      finalState: {},
      actions: [{ type: "escalate", success: true }],
    },
  },
];
