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

// ADMIN_SERVICE_ACCOUNT is BASE64-ENCODED JSON across this platform. A service
// account contains a PEM private key full of newlines, and env vars carrying
// literal newlines get mangled by hosts, shells and dashboards alike — base64
// is what makes the value survive the trip, and it is what is actually set on
// Railway today.
//
// This parsed only raw JSON or a FILE PATH, so it fell through to
// `require(path.resolve(raw))` and tried to load the base64 blob as a module.
// The failure read `Cannot find module '/app/eyJ0eXBlIjoi…'` — which names no
// env var and looks like a packaging bug, so it sends whoever debugs it into
// the Dockerfile rather than the configuration. Every protected route then
// answered 503, and login could not complete anywhere on the platform.
//
// Order matters: JSON first (unambiguous), then base64 — accepted only when it
// decodes to something that starts with `{`, so an actual path is never
// mistaken for base64 — then the path form, which stays supported for local
// development.
function parseServiceAccount(raw: string): Record<string, unknown> {
  const value = raw.trim();
  if (value.startsWith('{')) return JSON.parse(value);

  const decoded = Buffer.from(value, 'base64').toString('utf8').trim();
  if (decoded.startsWith('{')) return JSON.parse(decoded);

  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  return require(path.resolve(value));
}

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
    const sa = parseServiceAccount(raw);
    admin.initializeApp({ credential: admin.credential.cert(sa as admin.ServiceAccount) });
    ready = true;
    logger.info('[firebase] Admin initialised for JWT verification.');
  } catch (e) {
    // Deliberately does NOT include the underlying message. `require()` puts the
    // resolved path in its error, and when the value is a service account that
    // path IS the credential — which is how the private key ended up in the
    // deploy logs in the first place.
    reportUnconfigured('ADMIN_SERVICE_ACCOUNT could not be parsed as JSON, base64 JSON, or a readable path');
  }
}

export const firebaseReady = (): boolean => ready;
