import { defineConfig } from 'vitest/config';

// Live suite — needs the headless ComfyUI instance up (scripts/launch-comfyui.ps1) and the models
// installed. Run explicitly with `npm run test:integration`; never part of `npm test`.
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 300_000,
  },
});
