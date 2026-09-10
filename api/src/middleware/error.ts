import { Request, Response, NextFunction } from 'express';

export function notFoundHandler(_req: Request, res: Response) {
  return res.status(404).json({ error: 'Route not found' });
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error('Unhandled API error:', err);
  if (res.headersSent) return;
  return res.status(err?.statusCode || 500).json({ error: 'Internal server error' });
}
