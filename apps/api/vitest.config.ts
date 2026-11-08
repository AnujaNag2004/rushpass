import { defineConfig } from 'vitest/config';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://rushpass:rushpass@localhost:5432/rushpass_test';
const TEST_REDIS = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DB,
      REDIS_URL: TEST_REDIS,
      DISABLE_JOBS: 'true',
    },
  },
});
