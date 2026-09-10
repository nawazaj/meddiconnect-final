import { Request, Response } from 'express';
import { pool } from '../config/db';

// Doctor adds a medical record for a patient after a visit
export async function createRecord(req: Request, res: Response) {
  try {
    const doctorId = req.user!.id; // set by verifyToken middleware
    const { patient_id, complaint, diagnosis, notes } = req.body;

    if (!patient_id || !complaint) {
      return res.status(400).json({ error: 'patient_id and complaint are required' });
    }

    const patient = await pool.query(`SELECT 1 FROM users WHERE id=$1 AND role='patient'`, [patient_id]);
    if (!patient.rowCount) return res.status(404).json({ error: 'Patient not found' });
    const linked = await pool.query(`SELECT 1 FROM patient_profiles WHERE user_id=$1 AND linked_doctor_id=$2`, [patient_id, doctorId]);
    if (!linked.rowCount) return res.status(403).json({ error: 'Patient is not linked to you' });
    const result = await pool.query(
      `INSERT INTO medical_records (patient_id, doctor_id, complaint, diagnosis, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [patient_id, doctorId, complaint, diagnosis || null, notes || null]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create record error:', err);
    return res.status(500).json({ error: 'Could not create medical record' });
  }
}

// Get full visit history for a patient (patient viewing own records, or their doctor viewing them)
export async function getPatientRecords(req: Request, res: Response) {
  try {
    const { patientId } = req.params;
    const user = req.user!;
    if (user.role === 'patient' && user.id !== patientId) return res.status(403).json({ error: 'You can only view your own records' });
    if (user.role === 'doctor') {
      const linked = await pool.query(`SELECT 1 FROM patient_profiles WHERE user_id=$1 AND linked_doctor_id=$2`, [patientId, user.id]);
      if (!linked.rowCount) return res.status(403).json({ error: 'Patient is not linked to you' });
    }
    if (!['patient','doctor','admin'].includes(user.role)) return res.status(403).json({ error: 'Not authorized' });

    const result = await pool.query(
      `SELECT mr.*, u.name AS doctor_name
       FROM medical_records mr
       JOIN users u ON u.id = mr.doctor_id
       WHERE mr.patient_id = $1
       ORDER BY mr.visit_date DESC`,
      [patientId]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error('Get records error:', err);
    return res.status(500).json({ error: 'Could not fetch medical records' });
  }
}
