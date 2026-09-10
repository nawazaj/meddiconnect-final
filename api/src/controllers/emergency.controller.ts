import { Request, Response } from 'express';
import { pool } from '../config/db';

export async function createEmergency(req: Request, res: Response) {
  try {
    const { symptoms, severity, location, appointment_id } = req.body;
    if (!symptoms || !severity || !['high','critical'].includes(severity)) {
      return res.status(400).json({ error: 'symptoms and severity (high|critical) are required' });
    }
    const result = await pool.query(
      `INSERT INTO emergency_requests(patient_id,appointment_id,severity,symptoms,location)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [req.user!.id, appointment_id || null, severity, symptoms, location || null]
    );
    const profile = await pool.query(`SELECT linked_doctor_id FROM patient_profiles WHERE user_id=$1`, [req.user!.id]);
    if (profile.rows[0]?.linked_doctor_id) {
      await pool.query(
        `INSERT INTO notifications(user_id,type,title,message) VALUES($1,'emergency','Emergency alert',$2)`,
        [profile.rows[0].linked_doctor_id, `Patient ${req.user!.id} submitted a ${severity} emergency request.`]
      );
    }
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Emergency error:', err);
    return res.status(500).json({ error: 'Could not create emergency request' });
  }
}

export async function listEmergencies(req: Request, res: Response) {
  try {
    const role = req.user!.role;
    const where = role === 'patient' ? 'e.patient_id=$1' : role === 'doctor' ? 'pp.linked_doctor_id=$1' : 'TRUE';
    const result = await pool.query(
      `SELECT e.*,u.name AS patient_name,u.phone AS patient_phone
       FROM emergency_requests e JOIN users u ON u.id=e.patient_id
       LEFT JOIN patient_profiles pp ON pp.user_id=e.patient_id
       WHERE ${where}
       ORDER BY CASE e.severity WHEN 'critical' THEN 1 ELSE 2 END,e.created_at DESC`,
      ['patient','doctor'].includes(role) ? [req.user!.id] : []
    );
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ error: 'Could not fetch emergency requests' });
  }
}

export async function updateEmergency(req: Request, res: Response) {
  try {
    const { status } = req.body;
    if (!['open','acknowledged','resolved','cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const result = await pool.query(
      `UPDATE emergency_requests SET status=$1,resolved_at=CASE WHEN $1='resolved' THEN NOW() ELSE resolved_at END
       WHERE id=$2 AND ($3='admin' OR EXISTS (SELECT 1 FROM patient_profiles pp WHERE pp.user_id=emergency_requests.patient_id AND pp.linked_doctor_id=$4)) RETURNING *`, [status, req.params.id, req.user!.role, req.user!.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Emergency request not found' });
    return res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: 'Could not update emergency request' });
  }
}
