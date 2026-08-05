import { Response, NextFunction } from 'express';
import admin from 'firebase-admin';
import { WithCorrelation } from './correlationId';
import { env } from '../config/env';
import { firebaseReady } from '../utils/firebase';
import { resolveIdentityId } from '../utils/identityResolver';
import { logger } from '../utils/logger';

// Verify the caller's Firebase JWT at the edge, then forward a TRUSTED identity
// to the upstream via headers. The inbound copies of those headers were stripped
// before this middleware ran (see trustedHeaders.ts), so what is set here is the
// only value an upstream can ever see.
//
// FAIL CLOSED. There is exactly one way to skip verification, and it cannot
// happen in production:
//
//     AUTH_DISABLED=true  AND  NODE_ENV !== 'production'
//
// An UNCONFIGURED Firebase is NOT a bypass. It used to be — `!firebaseReady()`
// attached a synthetic user — so a missing or malformed ADMIN_SERVICE_ACCOUNT in
// production turned the whole platform into an open API, with no error and no
// signal anywhere. Missing credentials now answer 503 on every protected route:
// the gateway still boots and still serves /health, so the misconfiguration is
// diagnosable rather than an outage, but nothing gets through unauthenticated.
function unauthenticated(res: Response, message: string): void {
  res.status(401).json({ error: { code: 'UNAUTHENTICATED', message } });
}

export async function authenticate(
  req: WithCorrelation & { user?: unknown },
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Dev-only escape hatch. env.authDisabled is already forced false in production.
  if (env.authDisabled) {
    req.user = { uid: 'dev' };
    req.headers['x-user-id'] = 'dev';
    req.headers['x-auth-via'] = 'dev-bypass';
    next();
    return;
  }

  if (!firebaseReady()) {
    logger.error('[auth] refusing request: Firebase is not configured (ADMIN_SERVICE_ACCOUNT).');
    res.status(503).json({
      error: { code: 'AUTH_UNAVAILABLE', message: 'Authentication is not configured on this gateway.' },
    });
    return;
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim();
  if (!token) {
    unauthenticated(res, 'Missing Authorization header');
    return;
  }

  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch {
    unauthenticated(res, 'Invalid or expired token');
    return;
  }

  req.user = decoded;
  req.headers['x-user-id'] = decoded.uid;
  req.headers['x-auth-via'] = 'gateway';
  if (decoded.email) req.headers['x-user-email'] = decoded.email;

  // Best effort — see identityResolver. A caller with no identity row yet (it is
  // created by POST /v1/auth/verify) is still authenticated; it simply travels
  // without x-identity-id.
  const identityId = await resolveIdentityId(decoded.uid);
  if (identityId) req.headers['x-identity-id'] = identityId;

  next();
}
