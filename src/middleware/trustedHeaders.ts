import { Request, Response, NextFunction } from 'express';

// Headers the gateway MINTS. Anything arriving from the internet carrying one of
// these is stripped before any other middleware runs.
//
// This is the counterpart to the upstreams trusting `x-gateway-key`: without it,
// a caller could simply send `x-user-id: <someone-else>` and — if it ever also
// obtained the gateway key — be believed. Stripping unconditionally means the
// only writer of these headers is authenticate()/proxyFactory, so there is no
// path by which a client value survives to an upstream.
//
// `x-correlation-id` is deliberately NOT in this list: it is a tracing hint, not
// a trust signal, and honouring a client's value is what lets a caller correlate
// its own logs with ours.
export const MINTED_HEADERS = [
  'x-gateway-key',
  'x-user-id',
  'x-user-email',
  'x-identity-id',
  'x-auth-via',
  // Which Firebase project verified this caller ('admin' = staff, 'user' =
  // rider/host). The two projects have SEPARATE uid spaces, so an upstream that
  // trusts x-user-id without this cannot tell a rider uid from a staff uid — and
  // a client allowed to set it could claim to be staff.
  'x-auth-project',
] as const;

export function stripMintedHeaders(req: Request, _res: Response, next: NextFunction): void {
  MINTED_HEADERS.forEach((h) => delete req.headers[h]);
  next();
}
