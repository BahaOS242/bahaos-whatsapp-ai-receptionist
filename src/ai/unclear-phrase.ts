/**
 * Tiny, purely mechanical shared helper for both providers'
 * `unclearPhraseObservation` construction — see
 * AIProviderResponse.unclearPhraseObservation's docstring (types.ts) for
 * what this is and isn't for. Deliberately NOT where the actual trigger
 * judgment call lives — each provider decides FOR ITSELF when a phrase
 * counts as "genuinely unclear," matching this codebase's existing
 * pattern of duplicating provider-specific judgment calls (see
 * CORRECTION_MARKER_RE's own comment in message-field-extraction.ts)
 * rather than sharing them. Only the mechanical "make this safe to
 * store" part is shared, since it carries no judgment at all.
 */

/** language_observations.phrase is varchar(255) — truncate defensively
 * so a long, rambling message can never fail the insert. Never the
 * customer's full raw message beyond that cap either way; if 255 chars
 * isn't enough to review it, growing the column is a schema decision,
 * not something to work around here. */
export function truncatePhrase(message: string): string {
  const trimmed = message.trim();
  return trimmed.length > 255 ? `${trimmed.slice(0, 252)}...` : trimmed;
}
