import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log:
    process.env.PRISMA_LOG === 'true'
      ? ['query', 'warn', 'error']
      : process.env.NODE_ENV === 'test'
        ? [] // expected unique-constraint errors in concurrency tests would be noise
        : ['warn', 'error'],
});
