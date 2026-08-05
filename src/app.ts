import express, { Express } from 'express';
import { securityMiddleware } from './middleware/security';
import { corsMiddleware } from './middleware/cors';
import { correlationId } from './middleware/correlationId';
import { requestLogger } from './middleware/requestLogger';
import { rateLimiter } from './middleware/rateLimiter';
import { validate } from './middleware/validate';
import { authenticate } from './middleware/authenticate';
import { notFound, errorHandler } from './middleware/errorHandler';
import { setupSwagger } from './config/swagger';
import healthRoutes from './routes/health.routes';
import authRoutes from './routes/auth.routes';
import platformRoutes from './routes/platform.routes';
import workspaceRoutes from './routes/workspace.routes';
import coreRoutes from './routes/core.routes';
import { notificationProxy } from './proxy/notification.proxy';

// IMPORTANT: no body parser. The gateway streams request bodies straight to the
// upstreams; parsing here would consume the stream and hang proxied POST/PUT.
export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');

  // Cross-cutting edge middleware, in order.
  app.use(securityMiddleware);
  app.use(corsMiddleware);
  app.use(correlationId);
  app.use(requestLogger);
  app.use(validate);
  app.use(rateLimiter);

  // Docs + health (no upstream dependency).
  setupSwagger(app);
  app.use('/health', healthRoutes);

  // Proxied surface (see config/routes.ts).
  app.use('/v1/auth', authRoutes);                         // public → identity
  app.use('/v1/platform', platformRoutes);                 // auth → authorization
  app.use('/v1/workspace', workspaceRoutes);               // auth → workspace
  app.use('/v1/core', coreRoutes);                         // auth → core
  app.use('/v1/notify', authenticate, notificationProxy);  // auth → notification

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
