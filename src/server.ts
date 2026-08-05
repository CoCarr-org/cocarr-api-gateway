import { createApp } from './app';
import { env } from './config/env';
import { initFirebase } from './utils/firebase';
import { logger } from './utils/logger';

initFirebase();
const app = createApp();
// Bind with NO host argument, so Node listens on :: with dual-stack and accepts
// both IPv4 and IPv6. Railway's PRIVATE NETWORK IS IPv6-ONLY: a server bound to
// '0.0.0.0' is reachable from the public edge and completely unreachable from
// sibling services, which presents as the gateway 502-ing every upstream while
// each upstream looks perfectly healthy on its own.
app.listen(env.port, () => {
  logger.info(`cocarr-api-gateway listening on ${env.port} (${env.nodeEnv})`);
});
