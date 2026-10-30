import { defineConfig } from 'vitest/config';

// Unit tests (happy-dom for localStorage) and database tests (PGlite, see test/db.ts)
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], environment: 'happy-dom', testTimeout: 30_000 },
});
