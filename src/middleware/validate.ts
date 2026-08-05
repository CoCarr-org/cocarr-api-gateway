import { Request, Response, NextFunction } from 'express';

// Edge guard rails. The gateway does not parse bodies, so validation here is
// coarse (size/shape of the request line). Extend per-route as needed.
export function validate(req: Request, res: Response, next: NextFunction): void {
  if ((req.originalUrl || '').length > 2048) {
    res.status(414).json({ error: { code: 'URI_TOO_LONG', message: 'Request URI too long' } });
    return;
  }
  next();
}
