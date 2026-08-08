import cors from 'cors';
import { env } from '../config/env';

// A rejected origin is a CONFIG gap, not a gateway fault, so it must not answer
// 500. The error carries status/code because `errorHandler` defaults a bare
// Error to 500 — which is what made a missing CORS_ORIGINS entry look like the
// gateway was broken. The browser blocks the response either way (no
// Access-Control-Allow-Origin header is emitted), but the status and the echoed
// origin are visible in the network tab and the logs, which is what makes the
// real cause findable. Keep the origin in the message for exactly that reason.
const notAllowed = (origin: string) =>
  Object.assign(new Error(`Origin ${origin} is not in CORS_ORIGINS`), {
    status: 403,
    code: 'CORS_ORIGIN_NOT_ALLOWED',
  });

// CORS allowlist. Empty = reflect any origin (with credentials off by policy at
// the browser). Set CORS_ORIGINS in production to the real web origins.
//
// A request with NO Origin header is allowed through: that is server-to-server
// traffic, curl, and health checks, none of which CORS governs.
export const corsMiddleware = env.corsOrigins.length
  ? cors({
      origin: (origin, cb) =>
        !origin || env.corsOrigins.includes(origin) ? cb(null, true) : cb(notAllowed(origin)),
      credentials: true,
    })
  : cors();
