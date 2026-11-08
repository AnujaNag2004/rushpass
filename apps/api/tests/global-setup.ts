import { execSync } from 'node:child_process';
import path from 'node:path';

/** Recreates the test database schema once before the whole run. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://rushpass:rushpass@localhost:5432/rushpass_test';
  execSync('npx prisma db push --force-reset --skip-generate --accept-data-loss', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
}
