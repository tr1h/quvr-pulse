import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
    environment: "node",
    // Unit tests must never hit the network or real services.
    env: {
      DATABASE_URL: "",
      REDIS_URL: "",
      FOMO_API_KEY: "",
      TELEGRAM_BOT_TOKEN: "",
      BLOCKSCOUT_API_KEY: "",
      LOG_LEVEL: "error",
    },
    coverage: { include: ["packages/scoring/src/**", "packages/shared/src/**"] },
  },
});
