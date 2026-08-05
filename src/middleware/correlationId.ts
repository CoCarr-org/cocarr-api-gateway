import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

// One id threaded through the whole request, echoed to the client and forwarded
// to every upstream (see proxyFactory) so a single call can be traced across
// services in the logs.
export interface WithCorrelation extends Request { correlationId?: string }

export function correlationId(req: WithCorrelation, res: Response, next: NextFunction): void {
  const id = (req.headers['x-correlation-id'] as string) || uuidv4();
  req.correlationId = id;
  res.setHeader('x-correlation-id', id);
  next();
}
