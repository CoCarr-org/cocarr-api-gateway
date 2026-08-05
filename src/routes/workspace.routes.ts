import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { workspaceProxy } from '../proxy/workspace.proxy';

// Workspace API: employees, HR, organization.
const router = Router();
router.use(authenticate, workspaceProxy);
export default router;
