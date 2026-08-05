import { Router } from 'express';
import { identityProxy } from '../proxy/identity.proxy';

// Public: login, refresh, password setup/reset, device management. The Identity
// Service enforces its own rules; the gateway does not pre-authenticate here.
const router = Router();
router.use(identityProxy);
export default router;
