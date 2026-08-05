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

// Deep check — pings each upstream's /v1/health. Not for the platform
// healthcheck (it depends on other services); use it for diagnostics.
router.get('/services', async (_req: Request, res: Response) => {
  const results = await Promise.all(
    Object.entries(services).map(async ([name, url]) => {
      try {
        const r = await axios.get(`${url}/v1/health`, { timeout: 2000 });
        return { name, url, ok: true, status: r.status };
      } catch (e) {
        return { name, url, ok: false, error: (e as any).code || (e as Error).message };
      }
    }),
  );
  res.json({ gateway: 'ok', services: results });
});

export default router;
