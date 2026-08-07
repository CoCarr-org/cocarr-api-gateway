import dotenv from 'dotenv';
dotenv.config();

const list = (v: string | undefined) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
const int = (v: string | undefined, d: number) => parseInt(v || String(d), 10);

// Single typed source for all configuration. Upstream URLs default to localhost
// ports so the gateway runs locally against services started on their defaults.
const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

export const env = {
  port: int(process.env.PORT, 8080),
  nodeEnv,
  isProduction,
  // AUTH_DISABLED is a DEVELOPMENT switch and is ignored in production, so a
  // variable left set on a promoted environment cannot open the platform up.
  authDisabled: process.env.AUTH_DISABLED === 'true' && !isProduction,
  // TWO FIREBASE PROJECTS, because this gateway fronts two different audiences.
  // Staff (admin/workspace/operations portals) sign in to the ADMIN project;
  // riders and hosts sign in to the USER project (`cocarr-front-end`). A token
  // is only valid against the project that minted it, so verifying with one
  // credential rejects every caller of the other.
  adminServiceAccount: process.env.ADMIN_SERVICE_ACCOUNT || '',
  userServiceAccount: process.env.USER_SERVICE_ACCOUNT || '',
  // Shared secret proving a request reached an upstream THROUGH this gateway.
  // Upstreams trust x-user-id/x-identity-id only when it matches, which is what
  // lets them skip a second Firebase verification. Unset = upstreams fall back
  // to verifying the bearer token themselves (still safe, just slower).
  gatewayKey: process.env.GATEWAY_KEY || '',
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
