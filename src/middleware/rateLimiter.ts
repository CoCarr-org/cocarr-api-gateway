import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

// Global rate limit at the edge. Tune per-route later by mounting additional
// limiters on specific routers.
export const rateLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  limit: env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down.' } },
});
