import { Request, Response } from 'express';
import { pool } from '../config/db';

export async function getMe(req: Request, res: Response) {
  try {
    const u = await pool.query(`SELECT id,name,email,role,phone,created_at FROM users WHERE id=$1`, [req.user!.id]);
    if (!u.rowCount) return res.status(404).json({ error: 'User not found' });
    let profile = null;
    if (req.user!.role === 'patient') {
      profile = (await pool.query(`SELECT * FROM patient_profiles WHERE user_id=$1`, [req.user!.id])).rows[0] || null;
    } else if (req.user!.role === 'doctor') {
      profile = (await pool.query(`SELECT * FROM doctor_profiles WHERE user_id=$1`, [req.user!.id])).rows[0] || null;
    } else if (req.user!.role === 'pharmacy') {
      profile = (await pool.query(`SELECT * FROM pharmacies WHERE owner_user_id=$1`, [req.user!.id])).rows[0] || null;
    }
    return res.json({ user: u.rows[0], profile });
  } catch (err) {
    return res.status(500).json({ error: 'Could not fetch profile' });
  }
}

export async function updatePatientProfile(req: Request, res: Response) {
  try {
    const { dob, gender, blood_group, address, emergency_contact_name, emergency_contact_phone, allergies, chronic_conditions } = req.body;
    const result = await pool.query(
      `INSERT INTO patient_profiles
       (user_id,dob,gender,blood_group,address,emergency_contact_name,emergency_contact_phone,allergies,chronic_conditions)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(user_id) DO UPDATE SET
       dob=EXCLUDED.dob,gender=EXCLUDED.gender,blood_group=EXCLUDED.blood_group,address=EXCLUDED.address,
       emergency_contact_name=EXCLUDED.emergency_contact_name,emergency_contact_phone=EXCLUDED.emergency_contact_phone,
       allergies=EXCLUDED.allergies,chronic_conditions=EXCLUDED.chronic_conditions
       RETURNING *`,
      [req.user!.id,dob||null,gender||null,blood_group||null,address||null,
       emergency_contact_name||null,emergency_contact_phone||null,allergies||null,chronic_conditions||null]
    );
    return res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: 'Could not update patient profile' });
  }
}

export async function addDependent(req: Request, res: Response) {
  try {
    const { name, relationship, dob, gender, blood_group, phone } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const result = await pool.query(
      `INSERT INTO dependents(account_owner_id,name,relationship,dob,gender,blood_group,phone)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user!.id,name,relationship||null,dob||null,gender||null,blood_group||null,phone||null]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: 'Could not create dependent' });
  }
}

export async function listDependents(req: Request, res: Response) {
  const result = await pool.query(`SELECT * FROM dependents WHERE account_owner_id=$1 ORDER BY name`, [req.user!.id]);
  return res.json(result.rows);
}
