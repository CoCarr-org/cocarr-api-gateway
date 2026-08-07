import admin from 'firebase-admin';
import path from 'path';
import { env } from '../config/env';
import { logger } from './logger';

// Lazy Firebase Admin init for JWT verification at the edge.
//
// TWO PROJECTS, and this is the whole reason the file is shaped this way. The
// platform has always had two Firebase projects — staff accounts in the ADMIN
// project, riders and hosts in the USER project (`cocarr-front-end`) — and the
// services already reflect that: core-api verifies staff with `adminAuth` and
// consumers with `userAuth`.
//
// The gateway only ever loaded the admin credential. That was invisible while
// it fronted staff portals alone, but `verifyIdToken` checks the token's issuer
// and audience against the project of the credential it was called on, so every
// rider and host token answered 401 "Invalid or expired token" — a message that
// blames the token rather than naming the missing credential. Pointing the
// consumer web and mobile apps at this gateway is what surfaced it.
//
// Unconfigured is a FAILURE, not a mode. `authenticate` answers 503 on every
// protected route when NEITHER project became ready — so the only thing missing
// credentials cost is a diagnosable refusal, never an open door. The banner
// below is loud in production because that is the one environment where nobody
// is watching the console at the moment it happens.
//
// Configuring only ONE project is legitimate (a deployment serving only staff,
// or only consumers): callers of the other are refused with a 401, and the boot
// log says which project is missing so the refusal is diagnosable.
type ProjectName = 'admin' | 'user';

const apps = new Map<ProjectName, admin.app.App>();

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
      `[firebase] FATAL: ${reason} — JWT verification is UNAVAILABLE for that audience ` +
        'and those callers will be refused.',
    );
  } else {
    logger.warn(`[firebase] ${reason} — those callers are refused unless AUTH_DISABLED=true.`);
  }
}

// Named apps, because firebase-admin's default app can hold exactly one
// credential and we need two side by side.
function initProject(name: ProjectName, raw: string, envVar: string): void {
  if (!raw) { reportUnconfigured(`${envVar} not set`); return; }
  try {
    const sa = parseServiceAccount(raw);
    const app = admin.initializeApp(
      { credential: admin.credential.cert(sa as admin.ServiceAccount) },
      name,
    );
    apps.set(name, app);
    logger.info(`[firebase] ${name} project initialised for JWT verification.`);
  } catch {
    // Deliberately does NOT include the underlying message. `require()` puts the
    // resolved path in its error, and when the value is a service account that
    // path IS the credential — which is how the private key ended up in the
    // deploy logs in the first place.
    reportUnconfigured(`${envVar} could not be parsed as JSON, base64 JSON, or a readable path`);
  }
}

export function initFirebase(): void {
  if (apps.size) return;
  initProject('admin', env.adminServiceAccount, 'ADMIN_SERVICE_ACCOUNT');
  initProject('user', env.userServiceAccount, 'USER_SERVICE_ACCOUNT');
  if (!apps.size) {
    reportUnconfigured('NEITHER ADMIN_SERVICE_ACCOUNT NOR USER_SERVICE_ACCOUNT is usable');
  }
}

// Ready when AT LEAST ONE project loaded. With none, `authenticate` answers 503
// (the gateway is broken); with one, a caller of the other project gets a 401
// (that caller is not recognised here) — two different facts that must not be
// reported as the same thing.
export const firebaseReady = (): boolean => apps.size > 0;

export interface VerifiedToken {
  decoded: admin.auth.DecodedIdToken;
  project: ProjectName;
}

// Verify against each configured project, first success wins.
//
// Tried rather than routed: the prefix a request arrives on does NOT determine
// which project minted its token. `/v1/core` serves riders AND the staff
// operations portal, so a per-prefix mapping would lock one of them out. The
// token's own `aud` is the real answer, and verifying is how it is established
// — checking it before verifying would be trusting an unverified claim.
//
// At most two verifications, and only the failing path pays for the second.
export async function verifyToken(token: string): Promise<VerifiedToken | null> {
  for (const [project, app] of apps) {
    try {
      return { decoded: await app.auth().verifyIdToken(token), project };
    } catch {
      // Wrong project, or a genuinely bad token — indistinguishable here, so
      // try the next one and let the caller 401 if none accept it.
    }
  }
  return null;
}
