import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import { logger } from './logger';
import { env } from '../config/env';

// Build a streaming reverse proxy to one upstream service. The gateway does NOT
// parse request bodies (see app.ts) so proxied POST/PUT bodies stream straight
// through. Propagates the correlation id and turns an unreachable upstream into
// a clean 502 rather than a hung socket.
//
// PATH: each router is mounted at its gateway prefix (e.g. app.use('/v1/core',
// ...)), so Express has already STRIPPED that prefix — the proxy sees the
// remainder ('/booking', '/health'). Every upstream service serves under '/v1',
// so we prepend '/v1' to the remainder ('/booking' -> '/v1/booking'). `prefix`
// is kept for logging/clarity only.
export function serviceProxy(name: string, target: string, prefix: string) {
  void prefix;
  const options: Options = {
    target,
    changeOrigin: true,
    pathRewrite: (p: string) => (p.startsWith('/v1') ? p : '/v1' + p),
    on: {
      proxyReq: (proxyReq: any, req: any) => {
        if (req.correlationId) proxyReq.setHeader('x-correlation-id', req.correlationId);
        // THE GATEWAY IS THE CORS BOUNDARY, so the browser's Origin does not
        // travel to the upstream. By the time we get here the origin has already
        // been checked against CORS_ORIGINS (middleware/cors.ts) and the response
        // headers decided; forwarding it only invites a SECOND, independent CORS
        // check on a service that no browser can reach.
        //
        // That second check is not hypothetical. cocarr-core-api runs the same
        // `cors()` allowlist off its own CORS_ORIGINS, and it has no public
        // domain — it is reachable only on core.railway.internal, through us. So
        // its allowlist could never see anything except an Origin we forwarded,
        // and when develop.cocarr.com was added here but not there, login passed
        // the gateway and died one hop later with "Not allowed by CORS": a
        // browser-shaped error from a service no browser can address.
        //
        // Removing it makes every proxied request read as what it actually is —
        // server-to-server — which upstreams already allow (`if (!origin) return
        // callback(null, true)`). One allowlist, in one place, is the point.
        proxyReq.removeHeader('origin');
        // Proof this request came through the gateway. Upstreams trust
        // x-user-id / x-identity-id ONLY when this matches, which is what lets
        // them skip a second Firebase verification. Set here rather than in
        // authenticate() so it also covers the public /v1/auth routes, where the
        // upstream still needs to know the hop was ours.
        if (env.gatewayKey) proxyReq.setHeader('x-gateway-key', env.gatewayKey);
      },
      error: (err: Error, _req: any, res: any) => {
        logger.error(`[proxy:${name}] ${err.message}`);
        if (res && typeof res.writeHead === 'function' && !res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code: 'BAD_GATEWAY', message: `${name} service unavailable` } }));
        }
      },
    },
  };
  return createProxyMiddleware(options);
}
