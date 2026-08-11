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

// SIGN-IN CANNOT REQUIRE A TOKEN — IT IS WHAT ISSUES ONE.
//
// The rider web app and the mobile app both authenticate through core: a phone
// number goes to `/user/send-otp`, the code comes back to `/user/verify-otp`,
// and only THEN does the client hold a Firebase token to send. Behind
// `authenticate` those two answer 401 `Missing Authorization header` — so login
// was impossible on both clients the moment they were cut over to the gateway,
// which is exactly what happened (see cocarr-frontend/src/config.js and
// cocarr-app/src/utils/constants.js, both now pointing at /v1/core).
//
// The two referral routes are the signup screen's, called BEFORE the OTP: it
// asks whether the programme is open before showing the code box, and validates
// a code typed by somebody who by definition has no account yet. Their upstream
// handlers carry an explicit "No auth" comment for that reason
// (cocarr-core-api/src/routes/referralRouter.js).
//
// THIS LIST IS NOT "WHATEVER UPSTREAM FORGOT TO GUARD", and must never be
// generated that way. A good number of core routes have no `authenticateUser`
// on them and absolutely must stay authenticated here — `POST /settings/:type`,
// `DELETE /city/:id`, `POST /transaction`, `PUT /protection-plan/:id` among
// them. The gateway is currently the only thing standing in front of those, so
// every entry below is a deliberate, individually-justified exception.
//
// Matched on METHOD AND EXACT PATH. A prefix match would be wrong in both
// directions: `/user` would expose the whole user API, and allowing any method
// would make `POST /referral/status` public too.
//
// THE SECOND GROUP IS NOT ABOUT BEING SIGNED OUT. `publicApi` in cocarr-frontend
// (src/api/client.js) is a bare axios instance with NO request interceptor, so
// it never attaches a token — not before login, and not after. Every endpoint it
// touches therefore 401s in every session state, which is why "Couldn't load
// brands and cities" appears on the vehicle-listing wizard to a signed-in host.
// Whether the rider web should be calling these anonymously at all is a separate
// question (see the note on /offers/validate below); this list reflects what it
// does call.
//
// Upstream, most of the second group carries `authenticateUserOptional` — a
// middleware that exists precisely to serve a caller with or without a token —
// which is the clearest signal available that anonymous access is intended.
const PUBLIC_ROUTES: ReadonlyArray<{ method: string; path: RegExp }> = [
  // ── Sign-in: these ISSUE the token, so they cannot require one. ──
  { method: 'POST', path: /^\/user\/send-otp\/?$/ },
  { method: 'POST', path: /^\/user\/verify-otp\/?$/ },
  { method: 'GET', path: /^\/referral\/status\/?$/ },
  { method: 'POST', path: /^\/referral\/validate\/?$/ },

  // ── Reference data: city and brand pickers on search and the listing wizard.
  { method: 'GET', path: /^\/city\/?$/ },
  { method: 'GET', path: /^\/brand\/?$/ },

  // ── Anonymous browsing: the marketplace listings and their price quote.
  // `GET /booking/summary` MUST stay an exact match — its sibling
  // `GET /booking/:id` has no auth upstream and would hand anyone any booking
  // by id, so a `/booking/…` prefix rule here would be a serious leak.
  { method: 'GET', path: /^\/vehicle\/?$/ },
  { method: 'GET', path: /^\/vehicle\/[^/]+\/?$/ },
  { method: 'GET', path: /^\/booking\/summary\/?$/ },

  // ── Offers shown against a listing before the user commits.
  // NOTE: `/offers/validate/:id` is `authenticateUserOptional` upstream, so it
  // judges a per-user offer as if nobody is signed in when called through
  // `publicApi`. That is a client bug, not a gateway one — fixing it means
  // moving the call onto the authenticated instance, not widening anything here.
  { method: 'GET', path: /^\/offers\/?$/ },
  { method: 'GET', path: /^\/offers\/validate\/[^/]+\/?$/ },

  // ── Location lookup on the landing-page search and the listing wizard.
  // ⚠ These proxy a paid third-party places API, so anonymous access is a
  // BILLING surface as much as a data one. The gateway's rate limiter is the
  // only thing bounding it — worth a per-route limit before this sees traffic.
  { method: 'GET', path: /^\/utility\/autocomplete\/?$/ },
  { method: 'POST', path: /^\/utility\/validate-place\/?$/ },
  { method: 'POST', path: /^\/utility\/validate-geo\/?$/ },
];

// `path` here is mount-RELATIVE (`/user/send-otp`, not `/v1/core/user/send-otp`)
// and carries no query string. Both patterns are anchored on that assumption;
// scripts/checkPublicImagePaths.mjs asserts it against a real Express mount.
function isPublicImage(method: string, path: string): boolean {
  return method === 'GET' && PUBLIC_IMAGE.test(path);
}

function isPublicCorePath(method: string, path: string): boolean {
  if (isPublicImage(method, path)) return true;
  return PUBLIC_ROUTES.some((r) => r.method === method && r.path.test(path));
}

// AN IMAGE THAT IS SERVED AND THEN DISCARDED BY THE BROWSER.
//
// `helmet()` at the edge defaults `Cross-Origin-Resource-Policy: same-origin`,
// which is right for an API and wrong for the one route that exists to be
// embedded. Every panel and the rider web app render these with a plain
// `<img src>` from a DIFFERENT origin (ops-dev.cocarr.com → apis-dev.cocarr.com),
// so the response arrived 200 with the right bytes and the right
// Access-Control-Allow-Origin, and Chrome threw it away with
// `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`. A 200 in the network tab plus a
// blank image is a genuinely confusing pair, and it sent us looking at buckets,
// keys and base URLs — none of which were wrong.
//
// Only React Native was unaffected, because it does not enforce CORP. That is
// exactly why this read as "the admin panels are broken" rather than "the image
// proxy is broken".
//
// `cross-origin` rather than `same-site`: local development runs the panels on
// localhost, which is not same-site with cocarr.com, so `same-site` would fix
// deployed and break local. And it gives away nothing — this route is already
// deliberately public (see the note above); possession of the unguessable key is
// what grants access, and CORP was never the control keeping anyone out.
//
// Scoped to the public image GET alone. Set here rather than by loosening
// helmet globally, so no other response's CORP changes.
const authenticateUnlessPublic: RequestHandler = (req, res, next) => {
  if (isPublicCorePath(req.method, req.path)) {
    if (isPublicImage(req.method, req.path)) {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
    next();
    return;
  }
  authenticate(req as Parameters<typeof authenticate>[0], res, next);
};

const router = Router();
router.use(authenticateUnlessPublic, coreProxy);
export default router;
