import { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { ROUTE_TABLE } from './routes';

// A thin self-description of the gateway's routing surface, served at /docs.
// The gateway proxies rather than implements, so this documents WHERE each
// prefix goes rather than every downstream operation.
export function setupSwagger(app: Express): void {
  const paths: Record<string, unknown> = {};
  for (const r of ROUTE_TABLE) {
    paths[`${r.prefix}`] = {
      get: {
        tags: ['Gateway'],
        summary: `Proxy → ${r.service}${r.auth ? ' (JWT required)' : ' (public)'}`,
        description: `${r.description} All sub-paths under ${r.prefix} are forwarded.`,
        responses: { 200: { description: 'Proxied to upstream' }, 502: { description: 'Upstream unavailable' } },
      },
    };
  }
  const spec = {
    openapi: '3.0.3',
    info: {
      title: 'Cocarr API Gateway',
      version: '0.1.0',
      description: 'Public edge for the Cocarr platform (api.cocarr.com). Handles JWT, routing, '
        + 'rate limiting, CORS, correlation ids and logging; contains no business logic.',
    },
    servers: [{ url: '/' }],
    paths,
  };
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec as any));
}
