import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { closeQueues } from './jobs/scheduler.js';
import { startWorkers } from './jobs/workers.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { createSocketServer } from './sockets/index.js';

async function main() {
  const app = createApp();
  const server = http.createServer(app);
  const sockets = createSocketServer(server);
  const stopWorkers = await startWorkers();

  server.listen(config.PORT, () => {
    logger.info(`🚀 RushPass API on http://localhost:${config.PORT}  (payments: ${config.razorpayEnabled ? 'Razorpay' : 'MOCK'})`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down gracefully');
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    server.close();
    await sockets.close().catch(() => undefined);
    await stopWorkers().catch(() => undefined);
    await closeQueues().catch(() => undefined);
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'failed to start');
  process.exit(1);
});
