import express, { Express } from 'express';
import { securityMiddleware } from './middleware/security';
import { stripMintedHeaders } from './middleware/trustedHeaders';
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

  // Railway (like any platform proxy) terminates TLS in front of us, so the
  // client address arrives in X-Forwarded-For. Without this, express-rate-limit
  // sees ONE ip — the platform's — and rate-limits every caller as if they were
  // the same client, while any per-ip logging records the proxy.
  app.set('trust proxy', 1);

  // FIRST, before anything can read them: drop client-supplied copies of the
  // headers this gateway mints. Everything downstream — including the upstream
  // services' trust in x-user-id — depends on these being unforgeable.
  app.use(stripMintedHeaders);

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
