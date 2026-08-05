import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorizationProxy } from '../proxy/authorization.proxy';

// IAM (Authorization Service): products, portals, modules, roles, permissions.
const router = Router();
router.use(authenticate, authorizationProxy);
export default router;
