import admin from 'firebase-admin';
import path from 'path';
import { env } from '../config/env';
import { logger } from './logger';

// Lazy Firebase Admin init for JWT verification at the edge, against the same
// admin project the services use.
//
// Unconfigured is a FAILURE, not a mode. `authenticate` answers 503 on every
// protected route when this never became ready — so the only thing missing
// credentials cost is a diagnosable refusal, never an open door. The banner
// below is loud in production because that is the one environment where nobody
// is watching the console at the moment it happens.
let ready = false;

function reportUnconfigured(reason: string): void {
  if (env.isProduction) {
    logger.error(
      `[firebase] FATAL: ${reason} — JWT verification is UNAVAILABLE and every ` +
        'protected route will answer 503. Set ADMIN_SERVICE_ACCOUNT.',
    );
  } else {
    logger.warn(`[firebase] ${reason} — protected routes answer 503 unless AUTH_DISABLED=true.`);
  }
}

export function initFirebase(): void {
  if (admin.apps.length) { ready = true; return; }
  const raw = env.adminServiceAccount;
  if (!raw) {
    reportUnconfigured('ADMIN_SERVICE_ACCOUNT not set');
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
    reportUnconfigured(`init failed: ${(e as Error).message}`);
  }
}

export const firebaseReady = (): boolean => ready;
