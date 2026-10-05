import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // tests/db/** requires a real, reachable Postgres instance (see
    // vitest.db.config.mts) — excluded from the default `npm test` run so
    // the main suite stays fast and has zero external dependencies, same
    // as every other test in this project. Run those explicitly via
    // `npm run test:db`.
    exclude: ["**/node_modules/**", "tests/db/**"],
  },
});
