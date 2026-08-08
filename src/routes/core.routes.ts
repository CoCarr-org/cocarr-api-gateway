import { Router, RequestHandler } from 'express';
import { authenticate } from '../middleware/authenticate';
import { coreProxy } from '../proxy/core.proxy';

// Core platform business API.
//
// THE IMAGE PROXY IS PUBLIC, AND HAS TO BE. Uploaded images live in a private
// bucket and are served through `GET /v1/core/image/<key>`; every client renders
// them with a plain `<img src>` (or RN `<Image source>`), which sends no
// Authorization header and cannot be made to send one. Behind `authenticate`
// every image on the rider web app and the mobile app answers 401 — so this
// exception is what makes the gateway usable as the sole entry point for those
// clients, which is the cutover the previous comment here anticipated.
//
// This is not a widening of access: the legacy monolith served the same route
// with no auth at all, so nothing becomes reachable that was not already. The
// key is an unguessable uuid (now `<folder>/<uuid>`) and possession of it is
// what grants access — the same bearer-token-in-a-URL model the bucket's own
// presigned links use.
//
// TWO THINGS ARE DELIBERATELY STILL AUTHENTICATED, and both would be serious to
// get wrong:
//
//   GET /image/url  — issues PRESIGNED UPLOAD CREDENTIALS. It lives under the
//                     same path prefix, so a naive `/image/*` exception would
//                     hand anonymous callers the ability to write to the
//                     bucket. It is matched FIRST and excluded explicitly.
//   POST /image     — the upload itself.
//
// RÉSUMÉS ARE IN THE SAME BUCKET AND MUST NOT BE PUBLIC.
//
// Candidate CVs uploaded through the careers site are stored under `resume/`.
// They are personal data — full name, address, phone number, employment history
// — and the whole reason they moved off Google Drive is that the old backend
// shared every one of them with ANYONE_WITH_LINK. Serving them from this proxy
// would recreate that exactly, with a uuid instead of a Drive id.
//
// They are read through an AUTHENTICATED workspace route instead
// (`GET /v1/workspace/candidates/:id/resume`). This exclusion is the other half
// of that: without it, the private route is decoration, because the object is
// reachable here without a token.
//
// Hence: method GET only, the key must not be the literal `url`, and it must
// not be under `resume/`.
const PUBLIC_IMAGE = /^\/image\/(?!url(?:\/|$))(?!resume\/).+/;

// THE PRE-AUTH SURFACE. These are the core routes a caller must be able to
// reach BEFORE it has a token, and gating them made login impossible: the web
// app's `publicApi` posts to `/user/send-otp` to obtain a token, which answered
// 401 `UNAUTHENTICATED` — you needed a token to reach the endpoint that issues
// tokens. Every one of these is already unauthenticated on the core service
// itself (see its `userRouter`, `cityRouter`, `referralRouter`), so this does
// not widen access; it stops the gateway from being stricter than the service
// it fronts in the one place where strictness is a deadlock.
//
// METHOD-SCOPED, AND THE CITY ENTRIES ARE THE REASON WHY. Upstream,
// `PUT /city/:id` and `DELETE /city/:id` carry NO auth middleware — only
// `POST /city` has `authenticateAdmin`. This gateway's blanket `authenticate`
// is currently the only thing standing in front of them. So a prefix match on
// `/city` would hand anonymous callers the ability to rewrite and delete
// cities. Match the METHOD as well as the path, always, and never relax one of
// these to a bare prefix.
//
// `/referral/status` and `/referral/validate` are public for the signup screen,
// which runs before the referee has an account. `/referral` and
// `/referral/history` are the user's own dashboard and stay authenticated.
const PUBLIC_CORE: ReadonlyArray<readonly [string, RegExp]> = [
  ['POST', /^\/user\/send-otp\/?$/],
  ['POST', /^\/user\/verify-otp\/?$/],
  ['GET', /^\/city\/?$/],
  ['GET', /^\/city\/[^/]+\/?$/],
  ['GET', /^\/referral\/status\/?$/],
  ['POST', /^\/referral\/validate\/?$/],
];

// `req.path` is mount-relative (`/city`, not `/v1/core/city`) and excludes the
// query string. Both patterns above are anchored on that assumption, which
// `scripts/checkPublicImagePaths.mjs` asserts against a real Express mount.
const isPublic = (method: string, path: string): boolean =>
  (method === 'GET' && PUBLIC_IMAGE.test(path))
  || PUBLIC_CORE.some(([m, pattern]) => m === method && pattern.test(path));

const authenticateUnlessPublic: RequestHandler = (req, res, next) => {
  if (isPublic(req.method, req.path)) {
    next();
    return;
  }
  authenticate(req as Parameters<typeof authenticate>[0], res, next);
};

const router = Router();
router.use(authenticateUnlessPublic, coreProxy);
export default router;
