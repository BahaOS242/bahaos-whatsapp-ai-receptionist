/** Asked when a customer qualifies a time ("quarter to 3pm", "not 3pm", "3pm or 4pm", "from 2pm to 4pm")
 * instead of stating one — see date-time.ts hasTimeQualifier. Shared by both providers. */
export const TIME_CLARIFICATION_REPLY =
  "I want to get the time exactly right. What one time works for you? (for example, 3:00 pm)";

/** The time was qualified but the DAY is also still missing: say both are outstanding instead of a generic prompt. */
export const TIME_AND_DATE_CLARIFICATION_REPLY =
  "I haven't set a time yet — I need one exact time (for example, 3:00 pm) and the day. What day, and which exact time?";

/** The customer qualified the time again after one clarification: stop repeating, offer a way forward. */
export const TIME_CLARIFICATION_REPEATED_REPLY =
  "I still need one exact time to continue. Reply with a single time like 3:00 pm or 4:00 pm — or tell me you'd like a team member to help and I'll pass your details to them.";
