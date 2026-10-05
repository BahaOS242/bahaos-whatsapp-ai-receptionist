import type { EvalScenario } from "../types";
import { bookingScenarios } from "./booking";
import { faqScenarios } from "./faq";
import { cancellationScenarios } from "./cancellation";
import { reschedulingScenarios } from "./rescheduling";
import { escalationScenarios } from "./escalation";
import { recoveryScenarios } from "./recovery";
import { naturalLanguageScenarios } from "./natural-language";

/** The full Phase 1 scenario corpus — enough to establish the framework
 * across every required category, not inflated for a large count. */
export const allScenarios: EvalScenario[] = [
  ...bookingScenarios,
  ...faqScenarios,
  ...cancellationScenarios,
  ...reschedulingScenarios,
  ...escalationScenarios,
  ...recoveryScenarios,
  ...naturalLanguageScenarios,
];

export {
  bookingScenarios,
  faqScenarios,
  cancellationScenarios,
  reschedulingScenarios,
  escalationScenarios,
  recoveryScenarios,
  naturalLanguageScenarios,
};
