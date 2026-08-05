import axios from 'axios';
import { env } from '../config/env';
import { logger } from './logger';

// FIREBASE UID -> PLATFORM IDENTITY ID.
//
// The platform identity id (uuid, owned by the Identity Service) is the stable
// key every other service references; the Firebase UID is an authentication
// detail that must not spread. The gateway resolves the mapping once and
// forwards it as `x-identity-id`, so no downstream service needs to know
// Firebase exists.
//
// BEST EFFORT, deliberately: a caller can be authenticated (valid token) before
// it has an identity row — `POST /v1/auth/verify` is what creates one. Failing
// the request because the mapping is not there yet would make the very call
// that fixes it impossible. Downstream services must treat `x-identity-id` as
// optional and fall back to `x-user-id`.

const TTL_MS = 5 * 60 * 1000; // a mapping is immutable once created
const NEGATIVE_TTL_MS = 30 * 1000; // no row yet — re-ask soon
const MAX_ENTRIES = 10_000; // bounded so a token-spraying caller cannot grow it without limit

interface Entry { identityId: string | null; expiresAt: number }
const cache = new Map<string, Entry>();

function remember(uid: string, identityId: string | null): void {
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(uid, { identityId, expiresAt: Date.now() + (identityId ? TTL_MS : NEGATIVE_TTL_MS) });
}

export async function resolveIdentityId(uid: string): Promise<string | null> {
  const hit = cache.get(uid);
  if (hit && hit.expiresAt > Date.now()) return hit.identityId;

  try {
    const r = await axios.get(`${env.services.identity}/v1/identity/${encodeURIComponent(uid)}`, {
      timeout: 2000,
      // The gateway is calling an upstream on its own behalf: the same trusted
      // header contract every other proxied request uses.
      headers: {
        ...(env.gatewayKey ? { 'x-gateway-key': env.gatewayKey } : {}),
        'x-user-id': uid,
      },
    });
    const identityId: string | null = r.data?.id || null;
    remember(uid, identityId);
    return identityId;
  } catch (e) {
    const status = (e as any).response?.status;
    // 404 is a real answer ("no identity row yet") and worth caching briefly.
    // Anything else is an outage on our side — do not cache a wrong "no".
    if (status === 404) remember(uid, null);
    else logger.warn(`[identity] mapping lookup failed for ${uid}: ${(e as Error).message}`);
    return null;
  }
}

export function clearIdentityCache(): void {
  cache.clear();
}
