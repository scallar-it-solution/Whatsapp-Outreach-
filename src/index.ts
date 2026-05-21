import Fastify, { type FastifyInstance } from 'fastify';
import { config } from './config/env';
import { runMigrations } from './db/client';
import { registerDashboardRoutes } from './dashboard/routes';
import { registerHealthRoutes } from './health/routes';
import { autoRegisterActiveSenders } from './senders/service';
import { loadTemplatesFromConfig } from './templates/loader';
import { logger } from './utils/logger';
import { registerWebhookRoutes } from './webhook/handler';

export async function buildServer(): Promise<FastifyInstance> {
  try {
    const app = Fastify({
      logger: false,
      bodyLimit: 2 * 1024 * 1024,
    });
    app.setErrorHandler((error, _request, reply) => {
      logger.error({ service: 'api', err: error.message }, 'request failed');
      void reply.code(500).send({ error: 'internal_error' });
    });
    registerHealthRoutes(app);
    registerWebhookRoutes(app);
    await registerDashboardRoutes(app);
    return app;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown server build error';
    throw new Error(`Failed to build server: ${message}`);
  }
}

export async function startServer(): Promise<void> {
  try {
    await runMigrations();
    await autoRegisterActiveSenders();
    await loadTemplatesFromConfig();
    const app = await buildServer();
    await app.listen({ port: config.APP_PORT, host: '0.0.0.0' });
    logger.info({ service: 'api', port: config.APP_PORT }, 'API server started');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown server start error';
    logger.error({ service: 'api', err: message }, 'API server failed to start');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void startServer();
}
