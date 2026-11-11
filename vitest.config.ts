import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The CLI's colors are part of what the deploy snapshots record.
    env: { FORCE_COLOR: '1' },
    restoreMocks: false,
  },
});
