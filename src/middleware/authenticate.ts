import { Response, NextFunction } from 'express';
import admin from 'firebase-admin';
import { WithCorrelation } from './correlationId';
import { env } from '../config/env';
import { firebaseReady } from '../utils/firebase';

// Verify the caller's Firebase JWT at the edge and forward identity to the
// upstream via headers. Per the architecture the Identity Service owns login
// and sessions; the gateway's job here is only to VALIDATE the bearer token on
// protected routes and reject early.
//
// Dev mode: with Firebase unconfigured or AUTH_DISABLED=true, a synthetic user
// is attached so the gateway is usable locally. Never enable in production.
export async function authenticate(req: WithCorrelation & { user?: unknown }, res: Response, next: NextFunction): Promise<void> {
  if (env.authDisabled || !firebaseReady()) {
    req.user = { uid: 'dev' };
    req.headers['x-user-id'] = 'dev';
    next();
    return;
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  if (!token) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Missing Authorization header' } });
    return;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    req.headers['x-user-id'] = decoded.uid;
    if (decoded.email) req.headers['x-user-email'] = decoded.email;
    next();
  } catch {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired token' } });
  }
}
