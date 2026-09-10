export type UserRole = 'patient' | 'doctor' | 'pharmacy' | 'blood_bank' | 'admin';

export interface JwtPayload {
  id: string;
  role: UserRole;
  email: string;
}

// Extend Express's Request type so `req.user` is available after auth middleware runs
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
