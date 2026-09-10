import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db';

const resetCodes = new Map<string, { code: string; expiresAt: number }>();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

export async function signup(req: Request, res: Response) {
  try {
    const { name, email, password, role, phone } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!name || !normalizedEmail || !password || !role) {
      return res.status(400).json({ error: 'name, email, password and role are required' });
    }

    const validRoles = ['patient', 'doctor', 'pharmacy', 'blood_bank', 'admin'];
    if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (role === 'admin') return res.status(403).json({ error: 'Admin accounts must be provisioned by an administrator' });
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `role must be one of ${validRoles.join(', ')}` });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if ((existing.rowCount ?? 0) > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const client = await pool.connect();
    let user: any;
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO users (name, email, password_hash, role, phone)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, email, role, phone, created_at`,
        [String(name).trim(), normalizedEmail, passwordHash, role, phone || null]
      );
      user = result.rows[0];

      // Give newly registered users the profile structure expected by the rest of the API.
      if (role === 'patient') {
        await client.query(`INSERT INTO patient_profiles(user_id) VALUES($1)`, [user.id]);
      } else if (role === 'doctor') {
        await client.query(`INSERT INTO doctor_profiles(user_id,is_available) VALUES($1,false)`, [user.id]);
        await client.query(`INSERT INTO doctor_verifications(doctor_id,status) VALUES($1,'pending')`, [user.id]);
      }
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, {
      expiresIn: '7d',
    });
    await pool.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,ip_address) VALUES($1,'account_created','user',$1,$2::jsonb,$3::inet)`, [user.id, JSON.stringify({ role: user.role }), req.ip]).catch(() => {});

    return res.status(201).json({ user, token });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Something went wrong during signup' });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, {
      expiresIn: '7d',
    });

    await pool.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,ip_address) VALUES($1,'user_login','user',$1,$2::jsonb,$3::inet)`, [user.id, JSON.stringify({ method: 'password' }), req.ip]).catch(() => {});

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
      },
      token,
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Something went wrong during login' });
  }
}


export async function forgotPassword(req: Request, res: Response) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'email is required' });
    const result = await pool.query(`SELECT id FROM users WHERE email=$1`, [email]);
    if (!result.rowCount) return res.status(404).json({ error: 'No account found for that email' });
    const code = String(Math.floor(100000 + Math.random() * 900000));
    resetCodes.set(email, { code, expiresAt: Date.now() + 10 * 60 * 1000 });
    await pool.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,'password_reset_requested','user',$1,$2::jsonb)`, [result.rows[0].id, JSON.stringify({ channel: 'prototype_code' })]).catch(() => {});
    return res.json({ message: 'Reset code generated', demo_code: code });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Could not start password reset' }); }
}

export async function resetPassword(req: Request, res: Response) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();
    const newPassword = String(req.body?.new_password || '');
    if (!email || !code || newPassword.length < 8) return res.status(400).json({ error: 'email, code and a password of at least 8 characters are required' });
    const saved = resetCodes.get(email);
    if (!saved || saved.code !== code || saved.expiresAt < Date.now()) return res.status(400).json({ error: 'Invalid or expired reset code' });
    const user = await pool.query(`SELECT id FROM users WHERE email=$1`, [email]);
    if (!user.rowCount) return res.status(404).json({ error: 'Account not found' });
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [passwordHash, user.rows[0].id]);
    resetCodes.delete(email);
    await pool.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES($1,'password_reset_completed','user',$1)`, [user.rows[0].id]).catch(() => {});
    return res.json({ message: 'Password updated successfully' });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Could not reset password' }); }
}
