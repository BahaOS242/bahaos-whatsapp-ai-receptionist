/**
 * What counts as the customer APPROVING a confirmation summary.
 *
 * An approval authorizes exactly the details that were shown. A message that
 * approves AND hedges, conditions or adds something ("Yes, but I'd like the
 * chair by the window", "yes, make it 3pm", "yes?") is not a pure approval: it
 * must not complete a booking — the application restates what it can book and
 * asks again. (Schedule/service/name/phone changes bundled with a "yes" are
 * handled separately as corrections, which also clear the old approval.)
 */
const APPROVAL_RE =
  /^\s*(?:yes|yeah|yep|yup|ya|yea|sure|ok(?:ay)?|alright|all right|go ahead|please (?:do|go ahead|book)|do it|book it|sounds (?:good|great)|looks (?:good|right|correct)|that(?:'s| is)? (?:right|correct|fine|perfect|good|great|works)|works for me|perfect|great|correct|confirm(?:ed)?|definitely|absolutely)\b/i;

const HEDGE_RE =
  /\?|\b(?:but|however|except|only if|as long as|provided|unless|though|although|if possible|one thing|instead|also|and (?:can|could|please|i|also)|before you)\b/i;

export function isApproval(message: string): boolean {
  return APPROVAL_RE.test(message);
}

/** An approval that carries no hedge, condition or extra request. */
export function isPureApproval(message: string): boolean {
  return isApproval(message) && !HEDGE_RE.test(message);
}

export const HEDGED_APPROVAL_NOTE =
  "I can only book the exact details below — I can't promise anything beyond them (extra requests would need the team).";
