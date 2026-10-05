import type { EvalScenario } from "../types";

export const cancellationScenarios: EvalScenario[] = [
  {
    id: "CANCEL-01",
    category: "cancellation",
    description: "Normal cancellation, name + phone in one message",
    turns: ["I need to cancel my appointment", "Trevor 2428012847", "yes"],
    expected: {
      outcome: "completed",
      intent: "cancel_appointment",
      actions: [
        { type: "request_cancellation", payload: { name: "Trevor", phone: "+12428012847" } },
      ],
    },
  },
  {
    id: "CANCEL-02",
    category: "cancellation",
    description: "Phone given but name still missing — asks only for name, does not cancel",
    turns: ["I need to cancel my appointment", "2428012847"],
    expected: {
      outcome: "unresolved",
      finalState: { intent: "cancel_appointment", phone: "+12428012847" },
      prohibitedActions: ["request_cancellation"],
    },
  },
  {
    id: "CANCEL-03",
    category: "cancellation",
    description: "Name given but phone still missing — asks only for phone, does not cancel",
    turns: ["I need to cancel my appointment", "my name is Trevor"],
    expected: {
      outcome: "unresolved",
      finalState: { intent: "cancel_appointment", name: "Trevor" },
      prohibitedActions: ["request_cancellation"],
    },
  },
  {
    id: "CANCEL-04",
    category: "cancellation",
    description:
      "An incomplete phone number is rejected; a valid one afterward completes the cancellation",
    turns: ["I need to cancel my appointment", "Trevor", "12847", "2428012847", "yes"],
    expected: {
      outcome: "completed",
      intent: "cancel_appointment",
      actions: [
        { type: "request_cancellation", payload: { name: "Trevor", phone: "+12428012847" } },
      ],
    },
    notes: '"12847" (5 digits) is too short to even match the phone-candidate pattern.',
  },
];
