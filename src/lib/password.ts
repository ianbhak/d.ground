import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Room password hashing — server-only.
 *
 * Uses Node's built-in scrypt KDF (no native dependency). Format:
 *   scrypt$<saltHex>$<hashHex>
 */

const KEYLEN = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(plain, salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  const derived = scryptSync(plain, Buffer.from(saltHex, "hex"), KEYLEN);

  return (
    derived.length === expected.length && timingSafeEqual(derived, expected)
  );
}
