import { Response, NextFunction } from 'express';
import { WithCorrelation } from './correlationId';
import { logger } from '../utils/logger';

// Structured access log per request, tagged with the correlation id and latency.
export function requestLogger(req: WithCorrelation, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    logger.info(`${req.correlationId || '-'} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
}
