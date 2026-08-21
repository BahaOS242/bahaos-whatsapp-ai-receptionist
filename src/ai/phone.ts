/**
 * Phone number extraction/normalization. "12428012847", "1242 801 2847",
 * "+1 242 801 2847", and a bare local "8012847" (with a known area code
 * supplied) must all normalize to the same value — formatting shouldn't
 * matter, only the actual digits.
 */

const PHONE_CANDIDATE_RE = /(\+?\d[\d\s().-]{5,}\d)/;

/** Finds a phone-like substring in free text and normalizes it. Returns
 * undefined if nothing that looks like a real phone number is present —
 * never a partial/unnormalized string, since "looks close enough" is how
 * two different customers end up looking like the same phone number. */
export function extractPhone(text: string, areaCode: string): string | undefined {
  const match = text.match(PHONE_CANDIDATE_RE);
  if (!match) return undefined;
  const hadExplicitPlus = match[1].trim().startsWith("+");
  return normalizePhoneDigits(match[1].replace(/\D/g, ""), areaCode, hadExplicitPlus);
}

function normalizePhoneDigits(
  digits: string,
  areaCode: string,
  hadExplicitPlus: boolean,
): string | undefined {
  // 7/10/11(leading 1) are the unambiguous NANP shapes for this demo's
  // region. Anything else is only trusted as a phone number if the
  // customer explicitly wrote a "+" — otherwise an 8-digit date or
  // similar numeric string would falsely match.
  if (digits.length === 7) {
    return `+1${areaCode}${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  if (hadExplicitPlus && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  return undefined;
}
