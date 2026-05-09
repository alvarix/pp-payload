const ALLOWED_KEYS = new Set([
  "first_name",
  "last_name",
  "email",
  "phone",
  "referral",
  "pet_name",
  "pet_sex",
  "pet_breed",
  "pet_personality",
  "pet_social_media",
  "notes",
  "stripe_checkout_session_id",
]);

const MAX_STRING_LENGTH = 2000;

/**
 * Strip unknown keys, cap string length, and exclude any non-string values.
 * Used before storing form snapshots to prevent bloat and unexpected data.
 *
 * @param raw - Untrusted object from client
 * @returns Sanitized object with only known string fields
 */
export function sanitizeSnapshot(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (typeof value !== "string") continue;
    result[key] = value.slice(0, MAX_STRING_LENGTH);
  }
  return result;
}
