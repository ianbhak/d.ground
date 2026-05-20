import { defineConfig } from "vitest/config";
import { config } from "dotenv";

// Load .env.local so integration tests can reach Supabase.
config({ path: ".env.local" });

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    // Integration tests hit live Gemini / Supabase APIs. Run test files
    // sequentially so parallel suites don't hammer the API into 503s.
    fileParallelism: false,
  },
});
