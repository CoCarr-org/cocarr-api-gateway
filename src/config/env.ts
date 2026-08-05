import dotenv from 'dotenv';
dotenv.config();

const list = (v: string | undefined) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
const int = (v: string | undefined, d: number) => parseInt(v || String(d), 10);

// Single typed source for all configuration. Upstream URLs default to localhost
// ports so the gateway runs locally against services started on their defaults.
export const env = {
  port: int(process.env.PORT, 8080),
  nodeEnv: process.env.NODE_ENV || 'development',
  authDisabled: process.env.AUTH_DISABLED === 'true',
  adminServiceAccount: process.env.ADMIN_SERVICE_ACCOUNT || '',
  corsOrigins: list(process.env.CORS_ORIGINS),
  rateLimit: {
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    max: int(process.env.RATE_LIMIT_MAX, 300),
  },
  services: {
    identity: process.env.IDENTITY_SERVICE_URL || 'http://localhost:3050',
    authorization: process.env.AUTHORIZATION_SERVICE_URL || 'http://localhost:3060',
    workspace: process.env.WORKSPACE_SERVICE_URL || 'http://localhost:3040',
    core: process.env.CORE_SERVICE_URL || 'http://localhost:3030',
    notification: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3070',
  },
};

export type Env = typeof env;
