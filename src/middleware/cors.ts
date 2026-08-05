import cors from 'cors';
import { env } from '../config/env';

// CORS allowlist. Empty = reflect any origin (with credentials off by policy at
// the browser). Set CORS_ORIGINS in production to the real web origins.
export const corsMiddleware = env.corsOrigins.length
  ? cors({
      origin: (origin, cb) =>
        !origin || env.corsOrigins.includes(origin) ? cb(null, true) : cb(new Error('Not allowed by CORS')),
      credentials: true,
    })
  : cors();
