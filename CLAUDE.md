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
- **JWT is optional in dev.** With `ADMIN_SERVICE_ACCOUNT` unset or
  `AUTH_DISABLED=true`, `authenticate` attaches a synthetic user. Never in prod.

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

## Not done yet
- Public core exceptions: a few core routes (image proxy `/v1/image`, payment
  webhook `/v1/hook`) must bypass `authenticate` when the gateway becomes the
  SOLE entry. Add per-path exceptions in `core.routes.ts` at that cutover.
- Delegating auth to the Identity Service (the gateway verifies the Firebase JWT
  directly for now).
- Per-route rate limits, request/response schema validation, tests.

## Verified
tsc build clean; live boot smoke test (health/docs/404/correlation-id/rate-limit
wiring) and a real proxy round-trip (`/v1/core/health` → upstream `/v1/health`,
status + body passed through).
