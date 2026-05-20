import { randomBytes } from "node:crypto";

/**
 * Build a stable, readable room slug from its name.
 * "논문 논의 방" → "논문-논의-방-a3f9c1"
 *
 * Unicode letters/numbers (incl. Korean) are kept; everything else
 * collapses to hyphens. A 6-hex suffix guarantees uniqueness.
 * Server-only (uses node:crypto).
 */
export function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  const suffix = randomBytes(3).toString("hex");
  return base ? `${base}-${suffix}` : `room-${suffix}`;
}

/** True if the string is a UUID (vs a slug). */
export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s,
  );
}

/**
 * Normalize a room URL param to the value stored in the DB.
 * Route params may arrive percent-encoded; decoding is a no-op when
 * the value is already decoded.
 */
export function decodeRoomParam(param: string): string {
  try {
    return decodeURIComponent(param);
  } catch {
    return param;
  }
}
