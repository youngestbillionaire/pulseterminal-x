import 'dotenv/config';
import http from 'http';
import { app } from './app';
import { initializeWebSocket } from './lib/websocket';
import { initializeWorkers } from './jobs';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';

const PORT = parseInt(process.env.PORT || '3001', 10);

async function bootstrap() {
  try {
    // Verify database connection
    await prisma.$connect();
    logger.info('✅ Database connected');

    // Verify Redis connection
    await redis.ping();
    logger.info('✅ Redis connected');

    const server = http.createServer(app);

    // Initialize WebSocket server
    initializeWebSocket(server);
    logger.info('✅ WebSocket initialized');

    // Initialize background job workers
    await initializeWorkers();
    logger.info('✅ Job workers initialized');

    server.listen(PORT, () => {
      logger.info(`🚀 PulseTerminal X backend running on port ${PORT}`);
      logger.info(`   Environment: ${process.env.NODE_ENV}`);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received — shutting down gracefully`);
      server.close(async () => {
        await prisma.$disconnect();
        redis.disconnect();
        logger.info('Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

bootstrap();
