import admin from 'firebase-admin';
import path from 'path';
import { env } from '../config/env';
import { logger } from './logger';

// Lazy, optional Firebase Admin init for JWT verification at the edge. Same
// admin project the services use. When ADMIN_SERVICE_ACCOUNT is unset the
// gateway runs in a dev mode where authenticate() attaches a synthetic user
// instead of verifying — never enable that in production.
let ready = false;

export function initFirebase(): void {
  if (admin.apps.length) { ready = true; return; }
  const raw = env.adminServiceAccount;
  if (!raw) {
    logger.warn('[firebase] ADMIN_SERVICE_ACCOUNT not set — JWT verification disabled (dev mode).');
    return;
  }
  try {
    const sa = raw.trim().startsWith('{')
      ? JSON.parse(raw)
      : // eslint-disable-next-line @typescript-eslint/no-var-requires
        require(path.resolve(raw));
    admin.initializeApp({ credential: admin.credential.cert(sa) });
    ready = true;
    logger.info('[firebase] Admin initialised for JWT verification.');
  } catch (e) {
    logger.error(`[firebase] init failed: ${(e as Error).message}`);
  }
}

export const firebaseReady = (): boolean => ready;
