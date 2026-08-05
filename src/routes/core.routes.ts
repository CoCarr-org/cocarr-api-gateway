import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { coreProxy } from '../proxy/core.proxy';

// Core platform business API. NOTE: a few core routes are legitimately public
// when the gateway becomes the sole entry (image proxy, payment webhooks) — add
// per-path exceptions before authenticate when that cutover happens.
const router = Router();
router.use(authenticate, coreProxy);
export default router;
