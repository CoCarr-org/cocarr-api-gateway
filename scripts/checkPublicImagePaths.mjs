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

const PUBLIC_CORE = [
  ['POST', /^\/user\/send-otp\/?$/],
  ['POST', /^\/user\/verify-otp\/?$/],
  ['GET', /^\/city\/?$/],
  ['GET', /^\/city\/[^/]+\/?$/],
  ['GET', /^\/referral\/status\/?$/],
  ['POST', /^\/referral\/validate\/?$/],
];

const publicCheck = (method, path) =>
  (method === 'GET' && PUBLIC_IMAGE.test(path))
  || PUBLIC_CORE.some(([m, pattern]) => m === method && pattern.test(path));

const app = express();
const core = express.Router();
core.use((req, res) => {
  res.json({ authenticated: !publicCheck(req.method, req.path), seenPath: req.path });
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

  // The pre-auth surface: reachable without a token, or login deadlocks.
  ['POST', '/v1/core/user/send-otp', false, 'issues the OTP — cannot require a token'],
  ['POST', '/v1/core/user/verify-otp', false, 'exchanges OTP for a token — cannot require one'],
  ['GET', '/v1/core/city', false, 'city list — public reference data'],
  ['GET', '/v1/core/city/7', false, 'single city — public reference data'],
  ['GET', '/v1/core/referral/status', false, 'signup screen, before an account exists'],
  ['POST', '/v1/core/referral/validate', false, 'signup screen, before an account exists'],

  // CITY WRITES HAVE NO AUTH UPSTREAM — this gateway is the only thing in front
  // of them. If any of these flips to public, anonymous callers can edit and
  // delete cities.
  ['PUT', '/v1/core/city/7', true, 'NO auth upstream — gateway must gate it'],
  ['DELETE', '/v1/core/city/7', true, 'NO auth upstream — gateway must gate it'],
  ['POST', '/v1/core/city', true, 'city create must stay authed'],
  ['GET', '/v1/core/city/7/pickup-points', true, 'deeper path is not the public :id route'],

  // Neighbours of the pre-auth routes that must NOT be dragged public with them.
  ['GET', '/v1/core/user', true, 'user list is admin-only upstream'],
  ['POST', '/v1/core/user/send-otp/x', true, 'no suffix smuggling past the anchor'],
  ['GET', '/v1/core/user/send-otp', true, 'wrong method — not the public route'],
  ['GET', '/v1/core/referral', true, "the user's own referral dashboard"],
  ['GET', '/v1/core/referral/history', true, "the user's own referral history"],
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
  : '\nAll cases pass — only a GET of a real image key bypasses authentication.');
process.exit(failed ? 1 : 0);
