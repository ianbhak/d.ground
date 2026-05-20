import { defineConfig } from "vitest/config";
import { config } from "dotenv";

// Load .env.local so integration tests can reach Supabase.
config({ path: ".env.local" });

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
  },
});
