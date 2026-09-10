import { Request, Response } from 'express';
import { pool } from '../config/db';

export async function patientDashboard(req: Request, res: Response) {
  try {
    const id = req.user!.id;
    const [profile, appointments, reminders, prescriptions, labs, alerts, orders] = await Promise.all([
      pool.query(`SELECT u.id,u.name,u.email,u.phone,pp.* FROM users u LEFT JOIN patient_profiles pp ON pp.user_id=u.id WHERE u.id=$1`, [id]),
      pool.query(`SELECT a.*,d.name AS doctor_name FROM appointments a JOIN users d ON d.id=a.doctor_id WHERE a.patient_id=$1 AND a.status IN ('scheduled','confirmed') ORDER BY a.appointment_date LIMIT 5`, [id]),
      pool.query(`SELECT r.*,p.medicine_name,p.dosage FROM medicine_reminders r JOIN prescriptions p ON p.id=r.prescription_id WHERE r.patient_id=$1 ORDER BY r.time_of_day`, [id]),
      pool.query(`SELECT p.*,u.name AS doctor_name FROM prescriptions p JOIN users u ON u.id=p.doctor_id WHERE p.patient_id=$1 ORDER BY p.created_at DESC LIMIT 10`, [id]),
      pool.query(`SELECT * FROM lab_reports WHERE patient_id=$1 ORDER BY report_date DESC LIMIT 10`, [id]),
      pool.query(`SELECT * FROM ai_checkins WHERE patient_id=$1 AND flagged=true ORDER BY created_at DESC LIMIT 5`, [id]),
      pool.query(`SELECT * FROM medicine_orders WHERE patient_id=$1 ORDER BY created_at DESC LIMIT 5`, [id])
    ]);
    return res.json({ profile: profile.rows[0], appointments: appointments.rows, reminders: reminders.rows,
      prescriptions: prescriptions.rows, lab_reports: labs.rows, flagged_checkins: alerts.rows, orders: orders.rows });
  } catch (err) {
    console.error('Patient dashboard error:', err);
    return res.status(500).json({ error: 'Could not load patient dashboard' });
  }
}

export async function listDoctors(_req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT u.id,u.name,dp.specialization,dp.hospital_name,dp.years_experience
       FROM users u JOIN doctor_profiles dp ON dp.user_id=u.id WHERE u.role='doctor' ORDER BY u.name`
    );
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ error: 'Could not fetch doctors' });
  }
}
