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

// FIRST-PARTY PLATFORM ORIGINS ARE ALWAYS ALLOWED. Every Cocarr web app is a
// `*.cocarr.com` subdomain (develop, careers-dev, admins-dev, ops-dev,
// workspace-dev, and their production peers), and they all call this gateway.
// Enumerating each one in CORS_ORIGINS is how a new subdomain silently 403s —
// which is exactly what happened to careers-dev: its `Origin` was not in the
// list, so the browser blocked the response and the site showed "Failed to
// fetch". Allowing the platform's own apex and subdomains over https removes
// that whole class of bug; CORS_ORIGINS then only has to name any NON-cocarr.com
// origin (a partner, a preview host) that should also be let in.
const COCARR_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*cocarr\.com$/i;

// CORS allowlist. A request with NO Origin header is allowed through: that is
// server-to-server traffic, curl, and health checks, none of which CORS governs.
export const corsMiddleware = cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (COCARR_ORIGIN.test(origin)) return cb(null, true);
    // Non-cocarr origins: the explicit allowlist. Empty ⇒ reflect any origin
    // (dev convenience; the boot log warns), matching the prior behaviour.
    if (!env.corsOrigins.length || env.corsOrigins.includes(origin)) return cb(null, true);
    return cb(notAllowed(origin));
  },
  credentials: true,
});
