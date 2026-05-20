import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../src/lib/password";

describe("room password hashing", () => {
  it("verifies a correct password", () => {
    const hash = hashPassword("ground-2026");
    expect(verifyPassword("ground-2026", hash)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const hash = hashPassword("ground-2026");
    expect(verifyPassword("wrong", hash)).toBe(false);
  });

  it("never stores the plaintext", () => {
    const hash = hashPassword("super-secret");
    expect(hash).not.toContain("super-secret");
    expect(hash.startsWith("scrypt$")).toBe(true);
  });

  it("produces a unique salt per call", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("rejects malformed stored hashes", () => {
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "notscrypt$ab$cd")).toBe(false);
    expect(verifyPassword("x", "scrypt$onlyonepart")).toBe(false);
  });
});
