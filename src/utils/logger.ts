import { createLogger, format, transports } from 'winston';

// Console-only for the gateway: on Railway logs are captured from stdout, and a
// file transport would need a writable path in the container.
export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.printf((i) => `${i.timestamp}-${i.level}-${i.message}`),
  ),
  transports: [new transports.Console()],
});
