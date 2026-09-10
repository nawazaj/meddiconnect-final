import { Request, Response } from 'express';
import { pool } from '../config/db';

export async function createLabReport(req: Request, res: Response) {
  try {
    const { patient_id, doctor_id, lab_name, test_name, result_value, unit, reference_range, is_abnormal, report_url, report_date } = req.body;
    if (!patient_id || !lab_name || !test_name) return res.status(400).json({ error: 'patient_id, lab_name and test_name are required' });
    const patient = await pool.query(`SELECT 1 FROM users WHERE id=$1 AND role='patient'`, [patient_id]);
    if (!patient.rowCount) return res.status(404).json({ error: 'Patient not found' });
    if (req.user!.role === 'doctor') {
      const linked = await pool.query(`SELECT 1 FROM patient_profiles WHERE user_id=$1 AND linked_doctor_id=$2`, [patient_id, req.user!.id]);
      if (!linked.rowCount) return res.status(403).json({ error: 'Patient is not linked to you' });
    }
    const reportDoctorId = req.user!.role === 'doctor' ? req.user!.id : (doctor_id || null);
    const result = await pool.query(
      `INSERT INTO lab_reports(patient_id,doctor_id,lab_name,test_name,result_value,unit,reference_range,is_abnormal,report_url,report_date)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,NOW())) RETURNING *`,
      [patient_id, reportDoctorId, lab_name, test_name, result_value || null, unit || null,
       reference_range || null, is_abnormal ?? false, report_url || null, report_date || null]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create lab report error:', err);
    return res.status(500).json({ error: 'Could not create lab report' });
  }
}

export async function getPatientLabReports(req: Request, res: Response) {
  try {
    const user = req.user!;
    if (user.role === 'patient' && user.id !== req.params.patientId) return res.status(403).json({ error: 'You can only view your own lab reports' });
    if (user.role === 'doctor') {
      const linked = await pool.query(`SELECT 1 FROM patient_profiles WHERE user_id=$1 AND linked_doctor_id=$2`, [req.params.patientId, user.id]);
      if (!linked.rowCount) return res.status(403).json({ error: 'Patient is not linked to you' });
    }
    const result = await pool.query(
      `SELECT lr.*, d.name AS doctor_name FROM lab_reports lr
       LEFT JOIN users d ON d.id=lr.doctor_id WHERE lr.patient_id=$1 ORDER BY lr.report_date DESC`,
      [req.params.patientId]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Lab reports error:', err);
    return res.status(500).json({ error: 'Could not fetch lab reports' });
  }
}
