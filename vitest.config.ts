import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    env: { CLAUDE_MODE: 'replay', REPLAY_LATENCY_MS: '0', DB_PATH: ':memory:' },
  },
});
