# cocarr-api-gateway

TypeScript + Express reverse proxy — the platform's single public edge
(`api.cocarr.com`). Verifies JWTs, rate-limits, sets CORS/security headers,
threads a correlation id, logs, and proxies to the services. **No business logic.**

**Working branch: `develop`.** Build: `npm run build` (tsc → `dist/`). Start:
`node dist/server.js`. Dev: `npm run dev` (ts-node-dev). Port **8080** (`PORT`).

## The load-bearing gotchas
- **No body parser.** The gateway streams request bodies to upstreams; adding
  `express.json()` would consume the stream and hang proxied POST/PUT. Keep it out.
- **Path rewrite prepends `/v1`.** Each router is mounted at its prefix
  (`app.use('/v1/core', …)`), so Express strips that prefix and the proxy sees
  the remainder (`/booking`). Every upstream serves under `/v1`, so
  `proxyFactory` maps `/booking` → `/v1/booking`. Don't reintroduce a
  `^/v1/<prefix>` regex — after the mount strip it never matches.
- **Unreachable upstream → 502**, not a hung socket (handled in `proxyFactory`).
- **Auth fails CLOSED.** The only bypass is `AUTH_DISABLED=true` **and**
  `NODE_ENV !== 'production'` — both, always. An unset/malformed
  `ADMIN_SERVICE_ACCOUNT` is **not** a dev mode: every protected route answers
  **503 `AUTH_UNAVAILABLE`** and the boot log carries a FATAL banner. It used to
  attach a synthetic user, which meant a credentials typo in production silently
  opened the whole platform. The gateway still boots and still serves `/health`
  — failing to boot would hide the reason it is refusing.
- **`trust proxy` is set to 1.** Railway terminates TLS in front of us; without
  it `express-rate-limit` sees one ip and limits every caller as one client.

## Trusted-edge header contract
The gateway MINTS `x-gateway-key`, `x-user-id`, `x-user-email`, `x-identity-id`,
`x-auth-via`. `stripMintedHeaders` **deletes any client-supplied copy first, before
any other middleware runs** — that stripping is what makes an upstream's trust in
`x-user-id` safe, so do not move it, and add any new trusted header to
`MINTED_HEADERS` in the same commit that starts sending it.

`GATEWAY_KEY` must match the same variable on identity/authorization/workspace/
notification. With it set, those services trust the headers and skip a second
Firebase verification; a **non-matching** key is a hard deny there, never a
fall-through. Unset ⇒ they verify the bearer token themselves (correct, slower).

`x-identity-id` (the platform identity uuid, resolved via `utils/identityResolver`
with a 5-minute cache) is **best effort**: a caller is authenticated before
`POST /v1/auth/verify` creates its identity row, so upstreams must fall back to
`x-user-id`. `x-correlation-id` is deliberately NOT stripped — it is a tracing
hint, not a trust signal.

## Routing (config/routes.ts)
| Prefix | → Service | Auth |
|---|---|---|
| `/v1/auth` | identity | public |
| `/v1/platform` | authorization | JWT |
| `/v1/workspace` | workspace | JWT |
| `/v1/core` | core | JWT |
| `/v1/notify` | notification | JWT |

Upstream base URLs come from env (`*_SERVICE_URL`). Today only `core`
(cocarr-core-api) and `workspace` (cocarr-workspace-api) exist; the others are
configured and return 502 until built.

## TWO Firebase projects — staff and consumers are different audiences
`ADMIN_SERVICE_ACCOUNT` (staff: admin/workspace/operations portals) **and**
`USER_SERVICE_ACCOUNT` (riders/hosts: the `cocarr-front-end` project). Both are
initialised as named apps; `verifyToken` tries each and the first to accept the
token wins, returning which project it was.

**A token is only valid against the project that minted it.** The gateway loaded
the admin credential alone, which was invisible while it fronted staff portals
only — then every rider and host token answered `401 Invalid or expired token`, a
message that blames the credential rather than naming the missing config.

The projects are **tried, not routed by prefix**: `/v1/core` serves riders *and*
the staff operations portal, so a per-prefix mapping locks one of them out. The
token's own `aud` is the answer and verifying is how it is established.

Configuring only one project is legitimate — callers of the other get a 401 and
the boot log names the missing variable. **Neither** ⇒ 503 on every protected
route. Those are two different facts; don't collapse them.

`x-auth-project` (`admin` | `user`) is minted alongside `x-user-id` and is in
`MINTED_HEADERS`. The two projects have **separate uid spaces**, so an upstream
trusting `x-user-id` without it cannot tell a rider uid from a staff uid.

## The image proxy is PUBLIC, by necessity
`GET /v1/core/image/<key>` bypasses `authenticate` (`core.routes.ts`). Clients
render these with `<img src>` / RN `<Image source>`, which cannot send an
Authorization header — behind `authenticate` every image on the rider web and
mobile apps answers 401. The legacy monolith served the same route with no auth,
so nothing became reachable that was not already; the key is an unguessable uuid
and possession of it is what grants access.

⚠ **`GET /image/url` issues PRESIGNED UPLOAD CREDENTIALS** and lives under the
same prefix. It is excluded explicitly, as is `POST`. A naive `/image/*`
exception hands anonymous callers write access to the bucket.
`scripts/checkPublicImagePaths.mjs` asserts all of this against a real Express
mount (it also pins the assumption that `req.path` is mount-relative, which the
anchored pattern depends on). Run it after touching that file.

## Not done yet
- Public core exception for the payment webhook (`/v1/hook`) when Razorpay is
  repointed at the gateway — it cannot send a Firebase token either.
- Delegating auth to the Identity Service (the gateway verifies the Firebase JWT
  directly for now).
- Per-route rate limits, request/response schema validation, tests.

## Verified
tsc build clean; live boot smoke test (health/docs/404/correlation-id/rate-limit
wiring) and a real proxy round-trip (`/v1/core/health` → upstream `/v1/health`,
status + body passed through).
