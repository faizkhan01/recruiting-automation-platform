import { createApp } from './app.js';
import { config } from './config.js';
import { connectDatabase, disconnectDatabase } from './lib/database.js';
import { logger } from './lib/logger.js';
import { redis } from './lib/redis.js';
import { outreachQueue, sourcingQueue } from './queues/queues.js';

await connectDatabase();
const app = createApp();
const server = app.listen(config.API_PORT, () => {
  const apiUrl = `http://localhost:${config.API_PORT}/api`;
  const docsUrl = `http://localhost:${config.API_PORT}/api/docs`;

  logger.info({ url: apiUrl }, `API live at: ${apiUrl}`);
  logger.info({ url: docsUrl }, `API documentation live at: ${docsUrl}`);
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down API');
  server.close();
  await Promise.all([sourcingQueue.close(), outreachQueue.close(), redis.quit()]);
  await disconnectDatabase();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
