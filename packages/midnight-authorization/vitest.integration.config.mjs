import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/integration/**/*.test.mjs'],
    testTimeout: 10 * 60_000,
    hookTimeout: 15 * 60_000,
    sequence: { concurrent: false },
    fileParallelism: false,
  },
});
