import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// Unit tests (happy-dom for localStorage) and database tests (PGlite, see test/db.ts); the app code runs on the mock backend
export default defineConfig({
  resolve: { alias: { '@backend': fileURLToPath(new URL('./src/api/mock.ts', import.meta.url)) } },
  test: { include: ['test/**/*.test.ts'], environment: 'happy-dom', testTimeout: 30_000 },
});
