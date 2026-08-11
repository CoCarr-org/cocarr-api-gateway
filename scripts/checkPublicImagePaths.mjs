// Which /v1/core requests skip authentication — asserted against a REAL Express
// mount, not against the regex in isolation.
//
// Two independent things have to hold, and only one of them is the regex:
//
//   1. The pattern lets a real image key through and refuses `/image/url`,
//      which issues PRESIGNED UPLOAD CREDENTIALS and would otherwise let an
//      anonymous caller write to the private bucket.
//   2. `req.path` inside a router mounted at `/v1/core` is mount-RELATIVE
//      (`/image/x`, not `/v1/core/image/x`). The pattern is anchored with `^`,
//      so if that assumption is wrong every image stays 401 and the whole
//      point of the exception is lost.
//
// Run: node scripts/checkPublicImagePaths.mjs   (exits non-zero on any failure)

import express from 'express';
import http from 'node:http';

// Mirrors src/routes/core.routes.ts. Kept in sync by hand: this is a guard, and
// a guard that imports the thing it guards from a TS build step is a guard that
// gets skipped.
const PUBLIC_IMAGE = /^\/image\/(?!url(?:\/|$))(?!resume\/).+/;

const PUBLIC_ROUTES = [
  { method: 'POST', path: /^\/user\/send-otp\/?$/ },
  { method: 'POST', path: /^\/user\/verify-otp\/?$/ },
  { method: 'GET', path: /^\/referral\/status\/?$/ },
  { method: 'POST', path: /^\/referral\/validate\/?$/ },
  { method: 'GET', path: /^\/city\/?$/ },
  { method: 'GET', path: /^\/brand\/?$/ },
  { method: 'GET', path: /^\/vehicle\/?$/ },
  { method: 'GET', path: /^\/vehicle\/[^/]+\/?$/ },
  { method: 'GET', path: /^\/booking\/summary\/?$/ },
  { method: 'GET', path: /^\/offers\/?$/ },
  { method: 'GET', path: /^\/offers\/validate\/[^/]+\/?$/ },
  { method: 'GET', path: /^\/utility\/autocomplete\/?$/ },
  { method: 'POST', path: /^\/utility\/validate-place\/?$/ },
  { method: 'POST', path: /^\/utility\/validate-geo\/?$/ },
];

const isPublicCorePath = (method, path) => (
  (method === 'GET' && PUBLIC_IMAGE.test(path))
  || PUBLIC_ROUTES.some((r) => r.method === method && r.path.test(path))
);

const app = express();
const core = express.Router();
core.use((req, res) => {
  const isPublic = isPublicCorePath(req.method, req.path);
  res.json({ authenticated: !isPublic, seenPath: req.path });
});
app.use('/v1/core', core);

const server = http.createServer(app);
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const call = async (method, path) => {
  const res = await fetch(`${base}${path}`, { method });
  return res.json();
};

// [method, path, mustBeAuthenticated, why]
const CASES = [
  ['GET', '/v1/core/image/2f6a-uuid', false, 'bare legacy key — public'],
  ['GET', '/v1/core/image/kyc/2f6a-uuid', false, 'foldered key — public'],
  ['GET', '/v1/core/image/vehicle/a/b/c', false, 'deep key — public'],
  ['GET', '/v1/core/image/urlish-key', false, 'key merely starting with "url" — public'],

  ['GET', '/v1/core/image/resume/2f6a-uuid', true, 'CANDIDATE CV — personal data, must stay authed'],
  ['GET', '/v1/core/image/resume/', true, 'resume prefix, no key'],
  ['GET', '/v1/core/image/resumes/2f6a-uuid', false, 'different folder that merely starts with "resume"'],
  ['GET', '/v1/core/image/url', true, 'PRESIGNED UPLOAD CREDENTIALS — must stay authed'],
  ['GET', '/v1/core/image/url/', true, 'same, trailing slash'],
  ['GET', '/v1/core/image/url?folder=kyc', true, 'same, with query string'],
  ['POST', '/v1/core/image', true, 'upload — must stay authed'],
  ['POST', '/v1/core/image/kyc/x', true, 'write under image — must stay authed'],
  ['GET', '/v1/core/image/', true, 'no key'],
  ['GET', '/v1/core/image', true, 'no key at all'],

  ['GET', '/v1/core/user/me', true, 'ordinary core route'],
  ['GET', '/v1/core/booking/123', true, 'ordinary core route'],
  ['GET', '/v1/core/admin/users', true, 'admin must never be public'],
  ['GET', '/v1/core/settings', true, 'settings must stay authed'],

  // Sign-in: these are what ISSUE the token, so they cannot require one.
  ['POST', '/v1/core/user/send-otp', false, 'login step 1 — public'],
  ['POST', '/v1/core/user/verify-otp', false, 'login step 2 — public'],
  ['POST', '/v1/core/user/verify-otp/', false, 'same, trailing slash'],
  ['GET', '/v1/core/referral/status', false, 'signup screen, pre-OTP — public'],
  ['POST', '/v1/core/referral/validate', false, 'signup screen, pre-OTP — public'],

  // The exceptions are method+exact-path, and both halves matter.
  ['GET', '/v1/core/user/send-otp', true, 'wrong method — not the login route'],
  ['POST', '/v1/core/referral/status', true, 'wrong method'],
  ['GET', '/v1/core/referral', true, 'the referral dashboard is per-user — must stay authed'],
  ['GET', '/v1/core/referral/history', true, 'per-user referral history — must stay authed'],
  ['POST', '/v1/core/user/send-otp/extra', true, 'no prefix matching under a public path'],
  ['POST', '/v1/core/user', true, 'the user API must not follow its OTP routes'],
  ['PUT', '/v1/core/user', true, 'profile write — must stay authed'],

  // Unguarded upstream, and the gateway is the only thing in front of them.
  ['POST', '/v1/core/settings/general', true, 'no authenticateUser upstream — gateway must hold'],
  ['DELETE', '/v1/core/city/1', true, 'no authenticateUser upstream — gateway must hold'],
  ['POST', '/v1/core/transaction', true, 'no authenticateUser upstream — gateway must hold'],

  // Anonymous browsing — what rider-web's tokenless `publicApi` calls.
  ['GET', '/v1/core/city', false, 'city picker — public'],
  ['GET', '/v1/core/brand', false, 'brand picker — public'],
  ['GET', '/v1/core/vehicle', false, 'search results — public'],
  ['GET', '/v1/core/vehicle/abc-123', false, 'listing detail — public'],
  ['GET', '/v1/core/booking/summary', false, 'price quote — public'],
  ['GET', '/v1/core/offers', false, 'offers on a listing — public'],
  ['GET', '/v1/core/offers/validate/o-1', false, 'offer validation — public'],
  ['GET', '/v1/core/utility/autocomplete', false, 'place search — public'],
  ['POST', '/v1/core/utility/validate-place', false, 'place resolve — public'],
  ['POST', '/v1/core/utility/validate-geo', false, 'geo resolve — public'],

  // THE LEAK THIS EXACT-MATCHING EXISTS TO PREVENT. `/booking/:id` has no auth
  // upstream, so a `/booking/…` prefix rule would hand anyone any booking.
  ['GET', '/v1/core/booking/abc-123', true, "someone else's booking — must stay authed"],
  ['GET', '/v1/core/booking/last-booking', true, 'per-user — must stay authed'],
  ['GET', '/v1/core/booking/user/u-1', true, 'per-user — must stay authed'],

  // Writes under a publicly-readable path must not follow it.
  ['POST', '/v1/core/vehicle', true, 'vehicle create is admin-only'],
  ['PUT', '/v1/core/vehicle/abc-123', true, 'vehicle update is admin-only'],
  ['DELETE', '/v1/core/vehicle/abc-123', true, 'vehicle delete is admin-only'],
  ['PUT', '/v1/core/vehicle/add-photo/1', true, 'two segments — not the detail route'],
  ['POST', '/v1/core/offers', true, 'offer create is admin-only'],
  ['POST', '/v1/core/city', true, 'city create must stay authed'],
  ['GET', '/v1/core/city/1', true, 'not called anonymously — stays authed'],
  ['GET', '/v1/core/offers/booking/v-1', true, 'not in the list — stays authed'],
  ['GET', '/v1/core/utility/get-place', true, 'not in the list — stays authed'],
  ['POST', '/v1/core/utility/autocomplete', true, 'wrong method'],
];

let failed = 0;
let sawRelativePath = false;

for (const [method, path, wantAuth, why] of CASES) {
  const got = await call(method, path);
  if (got.seenPath.startsWith('/image')) sawRelativePath = true;
  const ok = got.authenticated === wantAuth;
  if (!ok) failed += 1;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${method.padEnd(4)} ${path.padEnd(34)} `
    + `authenticated=${String(got.authenticated).padEnd(5)} want=${String(wantAuth).padEnd(5)} ${why}`,
  );
}

if (!sawRelativePath) {
  failed += 1;
  console.log('\nFAIL  req.path was never mount-relative — the anchored pattern cannot match.');
}

server.close();
console.log(failed
  ? `\n${failed} failure(s): the public-image exception is NOT safe as written.`
  : '\nAll cases pass — only image reads and the listed public routes skip authentication.');
process.exit(failed ? 1 : 0);
