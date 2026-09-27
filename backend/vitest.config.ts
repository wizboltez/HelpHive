import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: { UPLOAD_DIR: ".data/test-uploads", AUTH_RATE_LIMIT: "1000", TOKEN_TTL: "30d" },
  },
});
