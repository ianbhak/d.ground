import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Next.js App Router renders the client-side fault
 * "missing required error components, refreshing..." — an infinite
 * reload loop — when a route throws (or calls notFound()) and no error
 * boundary special file is present. The app must define them.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions
 */
const APP_DIR = join(process.cwd(), "src", "app");

const REQUIRED = [
  "global-error.tsx", // catches errors thrown in the root layout
  "error.tsx", // catches errors in route segments (recoverable)
  "not-found.tsx", // handles notFound() and unmatched routes
];

describe("App Router error boundaries", () => {
  for (const file of REQUIRED) {
    it(`src/app/${file} exists and exports a default component`, () => {
      const path = join(APP_DIR, file);
      expect(existsSync(path), `${file} is missing`).toBe(true);
      expect(readFileSync(path, "utf8")).toMatch(/export default/);
    });
  }
});
