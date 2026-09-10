import { Request, Response } from 'express';
import { pool } from '../config/db';

// Doctor writes a new prescription for a patient
export async function createPrescription(req: Request, res: Response) {
  try {
    const doctorId = req.user!.id;
    const {
      patient_id,
      medical_record_id,
      medicine_name,
      dosage,
      frequency,
      duration,
      instructions,
    } = req.body;

    if (!patient_id || !medicine_name) {
      return res.status(400).json({ error: 'patient_id and medicine_name are required' });
    }

    const patient = await pool.query(`SELECT 1 FROM users WHERE id=$1 AND role='patient'`, [patient_id]);
    if (!patient.rowCount) return res.status(404).json({ error: 'Patient not found' });
    const linked = await pool.query(`SELECT 1 FROM patient_profiles WHERE user_id=$1 AND linked_doctor_id=$2`, [patient_id, doctorId]);
    if (!linked.rowCount) return res.status(403).json({ error: 'Patient is not linked to you' });
    if (medical_record_id) {
      const record = await pool.query(`SELECT 1 FROM medical_records WHERE id=$1 AND patient_id=$2 AND doctor_id=$3`, [medical_record_id, patient_id, doctorId]);
      if (!record.rowCount) return res.status(400).json({ error: 'medical_record_id does not belong to this patient and doctor' });
    }
    const result = await pool.query(
      `INSERT INTO prescriptions
        (patient_id, doctor_id, medical_record_id, medicine_name, dosage, frequency, duration, instructions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        patient_id,
        doctorId,
        medical_record_id || null,
        medicine_name,
        dosage || null,
        frequency || null,
        duration || null,
        instructions || null,
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create prescription error:', err);
    return res.status(500).json({ error: 'Could not create prescription' });
  }
}

// Patient (or their doctor) views all prescriptions for a patient
export async function getPatientPrescriptions(req: Request, res: Response) {
  try {
    const { patientId } = req.params;
    const user = req.user!;
    if (user.role === 'patient' && user.id !== patientId) return res.status(403).json({ error: 'You can only view your own prescriptions' });
    if (user.role === 'doctor') {
      const linked = await pool.query(`SELECT 1 FROM patient_profiles WHERE user_id=$1 AND linked_doctor_id=$2`, [patientId, user.id]);
      if (!linked.rowCount) return res.status(403).json({ error: 'Patient is not linked to you' });
    }
    if (!['patient','doctor','admin'].includes(user.role)) return res.status(403).json({ error: 'Not authorized' });

    const result = await pool.query(
      `SELECT p.*, u.name AS doctor_name
       FROM prescriptions p
       JOIN users u ON u.id = p.doctor_id
       WHERE p.patient_id = $1
       ORDER BY p.created_at DESC`,
      [patientId]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error('Get prescriptions error:', err);
    return res.status(500).json({ error: 'Could not fetch prescriptions' });
  }
}
