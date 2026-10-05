import { defineConfig } from "vitest/config";

/**
 * Separate config for tests/db/** — these require a real, reachable
 * Postgres instance with this project's migrations applied (see the
 * header comment in tests/db/appointments-concurrency.test.ts for setup
 * commands) and are never included in the default `npm test` run (see
 * vitest.config.mts's exclude). Run explicitly via `npm run test:db`.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    // Every file in tests/db/** shares ONE real Postgres database and each
    // file's own beforeEach calls resetTestData (a blunt delete-all — see
    // db-test-helpers.ts). Vitest runs separate test FILES in parallel
    // worker processes by default; with more than one DB test file, that
    // meant one file's beforeEach could truncate rows a concurrent file's
    // in-flight test still depended on, producing real (non-flaky) foreign
    // key violations. These tests are about REAL concurrency within a
    // single test's own Promise.all — not about running independent test
    // files against the same mutable database at the same time — so file
    // parallelism is disabled here specifically. Tests within one file
    // still run with genuine concurrency where they call Promise.all.
    fileParallelism: false,
  },
});
