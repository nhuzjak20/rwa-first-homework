import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // process.chdir() (used by the automat tests) requires a forked process.
    pool: 'forks',
  },
});
