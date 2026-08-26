import { defineConfig } from 'vitest/config';

// Offline unit suite only — the live suite is gated behind vitest.integration.config.ts.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
