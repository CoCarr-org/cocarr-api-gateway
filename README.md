# cocarr-api-gateway

> Enterprise API Gateway for Cocarr Platform.

Part of the **Cocarr Enterprise Platform** ([CoCarr-org](https://github.com/CoCarr-org)).

Topics: `nodejs`, `typescript`, `express`, `gateway`, `jwt`, `api`, `microservices`

## Purpose
The single public ingress (`api.cocarr.com`). It verifies JWTs, applies rate
limiting, sets CORS and security headers, threads a correlation id, logs, and
**reverse-proxies** to the identity, authorization, workspace, core and
notification services. **No business logic** lives here.

## Architecture
```
Internet → api.cocarr.com → API Gateway
   ├── /v1/auth       → Identity Service        (public)
   ├── /v1/platform   → Authorization Service    (JWT)
   ├── /v1/workspace  → Workspace API            (JWT)
   ├── /v1/core       → Core API                 (JWT)
   └── /v1/notify     → Notification Service      (JWT)
```
Each router is mounted at its prefix; the proxy prepends `/v1` to the remaining
path, so `/v1/core/booking` reaches Core API at `/v1/booking`. Upstream URLs are
env-driven; an unreachable upstream returns a clean `502` (`BAD_GATEWAY`). Today
`core` and `workspace` exist; `identity`/`authorization`/`notification` are
configured and `502` until deployed.

## Technology Stack
- Node.js + **TypeScript** (compiled to `dist/`)
- Express
- http-proxy-middleware v3 (streaming reverse proxy — no body parsing)
- firebase-admin (JWT verification), helmet, cors, express-rate-limit
- winston (logging), swagger-ui-express (`/docs`)

## Folder Structure
```
src/
  config/      # env, services (registry), routes (table), swagger
  middleware/  # authenticate, rateLimiter, correlationId, requestLogger,
               #   errorHandler, cors, security, validate
  proxy/       # identity/authorization/workspace/core/notification proxies
  routes/      # auth, platform, workspace, core, health routers
  utils/       # logger, firebase, proxyFactory
  app.ts       # assembles middleware + routes
  server.ts    # entry point
```

## Endpoints
- `GET /health` — liveness (no upstream calls; safe for Railway healthcheck)
- `GET /health/routes` — the route table
- `GET /health/services` — deep check: pings each upstream `/v1/health`
- `GET /docs` — Swagger UI (routing surface)
- `…/v1/{auth,platform,workspace,core,notify}/*` — proxied

## Getting Started
```bash
# Clone
git clone https://github.com/CoCarr-org/cocarr-api-gateway.git
cd cocarr-api-gateway

# Work from the develop branch
git checkout develop
```
Copy `.env.example` to `.env` where applicable and install dependencies with
your package manager (`pnpm install`).

## Development
- Format: `pnpm prettier --write .`
- Lint: `pnpm lint`
- Test: `pnpm test`

Editor settings, Prettier, ESLint, EditorConfig and VS Code configuration ship
with the repository for a consistent developer experience.

## Contributing
Please read [CONTRIBUTING.md](CONTRIBUTING.md) and use the issue and pull
request templates. All changes require CODEOWNER review.

## Branch Strategy
| Branch    | Purpose                                   | Protected |
|-----------|-------------------------------------------|-----------|
| `main`    | Always-deployable production baseline     | Yes       |
| `develop` | Integration branch for feature work       | No        |
| `release` | Release-candidate stabilisation branch    | Yes       |

Feature branches: `feature/<description>` from `develop`.

## Deployment
Containerised and deployed to Railway. CI builds the image and runs the test suite on every push.

## Security
See [SECURITY.md](SECURITY.md) for vulnerability reporting. Dependabot alerts
and secret scanning are enabled where supported.

## License
Licensed under the [MIT License](LICENSE).
