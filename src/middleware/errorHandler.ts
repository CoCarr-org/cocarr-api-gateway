import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Platform error contract: { error: { code, message } }.
export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.originalUrl}` } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction): void {
  const status = err.status || 500;
  if (status >= 500) logger.error(`${err.code || 'INTERNAL_SERVER_ERROR'}: ${err.message}`);
  if (res.headersSent) return;
  res.status(status).json({ error: { code: err.code || 'INTERNAL_SERVER_ERROR', message: err.message || 'Gateway error' } });
}
