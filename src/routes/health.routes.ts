import { Router, Request, Response } from 'express';
import axios from 'axios';
import { services } from '../config/services';
import { ROUTE_TABLE } from '../config/routes';

const router = Router();

// Liveness — cheap, no upstream calls (safe for Railway healthcheck).
router.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'cocarr-api-gateway', time: new Date().toISOString() });
});

// The routing surface this gateway exposes.
router.get('/routes', (_req: Request, res: Response) => {
  res.json({ routes: ROUTE_TABLE });
});

// Deep check — pings each upstream's /v1/health.
//
// IT ANSWERED 200 WHILE THE PLATFORM WAS DOWN, AND THAT IS WHY NOBODY NOTICED.
//
// `cocarr_workspace` — the workspace service's whole database schema —
// disappeared, and this endpoint reported `workspace: {ok:false}` continuously
// for hours inside a **200 OK**. Every generic monitor (Railway, UptimeRobot,
// Better Stack, a curl in a cron) watches the status code; not one of them
// would have fired. The outage was found by a human noticing a failed deploy.
//
// A body that says "degraded" inside a response that says "fine" is not a
// health check, it is a report that has to be read. So the status code now
// carries the verdict:
//
//   200  every upstream answered
//   503  at least one did not — the platform is degraded
//
// This is deliberately NOT the gateway's own Railway healthcheck (that is
// `/health`, and railway.json points at it). Wiring a platform-wide check to
// the container's liveness probe would restart or fail-deploy the GATEWAY
// because some other service is unwell — taking down the working half of the
// platform to report the broken half.
router.get('/services', async (_req: Request, res: Response) => {
  const results = await Promise.all(
    Object.entries(services).map(async ([name, url]) => {
      try {
        const r = await axios.get(`${url}/v1/health`, { timeout: 2000 });
        return { name, url, ok: true, status: r.status };
      } catch (e) {
        const err = e as any;
        // AN UPSTREAM THAT ANSWERED IS NOT AN UNREACHABLE UPSTREAM. axios
        // throws on a 4xx/5xx too, and the old handler reported both as a bare
        // `e.code` — so workspace answering `503 {db:false}` (a service that is
        // up and telling us precisely what is wrong) was flattened to
        // `ERR_BAD_RESPONSE`, which reads like a network fault and sends you
        // looking at the wrong layer. Surface the status and body when there is
        // one; `error` is now only for genuinely no response.
        if (err.response) {
          return {
            name,
            url,
            ok: false,
            status: err.response.status,
            // The upstreams' health bodies are small and diagnostic
            // (`{status, db, auth}`) — passing one through turns "workspace is
            // unhealthy" into "workspace cannot reach its database".
            detail: err.response.data ?? null,
          };
        }
        return { name, url, ok: false, error: err.code || (e as Error).message };
      }
    }),
  );

  const unhealthy = results.filter((r) => !r.ok).map((r) => r.name);
  res.status(unhealthy.length ? 503 : 200).json({
    gateway: 'ok',
    status: unhealthy.length ? 'degraded' : 'ok',
    // Named, so an alert can say WHICH service without parsing the array.
    unhealthy,
    services: results,
    time: new Date().toISOString(),
  });
});

export default router;
