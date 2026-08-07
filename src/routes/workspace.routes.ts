import { Router, RequestHandler } from 'express';
import { authenticate } from '../middleware/authenticate';
import { workspaceProxy } from '../proxy/workspace.proxy';

// Workspace API: employees, HR, organization.
//
// THE CAREERS ENDPOINTS ARE PUBLIC, and they have to be: an applicant is a
// member of the public with no account, so there is no token they could send.
// Everything else on this service — the employee directory, the org chart, the
// candidate pipeline — stays authenticated.
//
// The exception is scoped to the `/careers` PREFIX rather than to a list of
// paths. Upstream, those are the only unauthenticated routes and they live on
// their own router for exactly this reason: a path list here would have to be
// kept in step with the service by hand, and the failure mode of forgetting is
// either a public route that 401s (annoying) or an internal route that does not
// (serious). One prefix cannot drift.
//
// Read-only routes plus one POST. The POST is the application itself, which is
// the entire point — so this is deliberately NOT restricted to GET, unlike the
// image-proxy exception in core.routes.ts where a write would mean handing out
// upload credentials.
const PUBLIC_CAREERS = /^\/careers(\/|$)/;

const authenticateUnlessPublicCareers: RequestHandler = (req, res, next) => {
  if (PUBLIC_CAREERS.test(req.path)) {
    next();
    return;
  }
  authenticate(req as Parameters<typeof authenticate>[0], res, next);
};

const router = Router();
router.use(authenticateUnlessPublicCareers, workspaceProxy);
export default router;
