import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload, UserRole } from '../types';
import { pool } from '../config/db';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

// Verifies the JWT sent in the Authorization header ("Bearer <token>").
// Attaches the decoded payload to req.user so downstream handlers know who's calling.
export function verifyToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;
    if (!req.path.startsWith('/admin') && !req.path.startsWith('/notifications')) {
      pool.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,metadata,ip_address) VALUES($1,'api_request','api_request',$2::jsonb,$3::inet)`, [
        decoded.id, JSON.stringify({ method: req.method, path: req.path, query: req.query, user_agent: req.get('user-agent') || null }), req.ip
      ]).catch(() => {});
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Restricts a route to specific roles, e.g. checkRole(['doctor', 'admin'])
// Must run AFTER verifyToken so req.user is populated.
export function checkRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Not authorized for this action' });
    }
    next();
  };
}
