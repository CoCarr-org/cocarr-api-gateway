import { createApp } from './app';
import { env } from './config/env';
import { initFirebase } from './utils/firebase';
import { logger } from './utils/logger';

initFirebase();
const app = createApp();
app.listen(env.port, '0.0.0.0', () => {
  logger.info(`cocarr-api-gateway listening on ${env.port} (${env.nodeEnv})`);
});
