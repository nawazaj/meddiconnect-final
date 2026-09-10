import { Request, Response } from 'express';
import { pool } from '../config/db';

export async function patientHealthSummary(req: Request, res: Response) {
  try {
    const patientId = req.params.patientId;
    if (req.user!.role === 'patient' && req.user!.id !== patientId) return res.status(403).json({ error: 'You can only view your own health data' });
    if (req.user!.role === 'doctor') {
      const linked = await pool.query(`SELECT 1 FROM patient_profiles WHERE user_id=$1 AND linked_doctor_id=$2`, [patientId, req.user!.id]);
      if (!linked.rowCount) return res.status(403).json({ error: 'Patient is not linked to you' });
    }
    const [profile, records, prescriptions, labs, reminders, checkins] = await Promise.all([
      pool.query(`SELECT u.id,u.name,u.email,u.phone,pp.* FROM users u LEFT JOIN patient_profiles pp ON pp.user_id=u.id WHERE u.id=$1 AND u.role='patient'`, [patientId]),
      pool.query(`SELECT mr.*,d.name doctor_name FROM medical_records mr JOIN users d ON d.id=mr.doctor_id WHERE mr.patient_id=$1 ORDER BY mr.visit_date DESC LIMIT 20`, [patientId]),
      pool.query(`SELECT p.*,d.name doctor_name FROM prescriptions p JOIN users d ON d.id=p.doctor_id WHERE p.patient_id=$1 ORDER BY p.created_at DESC LIMIT 20`, [patientId]),
      pool.query(`SELECT * FROM lab_reports WHERE patient_id=$1 ORDER BY report_date DESC LIMIT 20`, [patientId]),
      pool.query(`SELECT r.*,p.medicine_name,p.dosage,p.frequency FROM medicine_reminders r JOIN prescriptions p ON p.id=r.prescription_id WHERE r.patient_id=$1 ORDER BY r.time_of_day`, [patientId]),
      pool.query(`SELECT * FROM ai_checkins WHERE patient_id=$1 ORDER BY created_at DESC LIMIT 20`, [patientId]),
    ]);
    if (!profile.rowCount) return res.status(404).json({ error: 'Patient not found' });
    res.json({ patient: profile.rows[0], records: records.rows, prescriptions: prescriptions.rows, lab_reports: labs.rows, reminders: reminders.rows, checkins: checkins.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not load health summary' }); }
}

export async function doctorPatients(req: Request, res: Response) {
  try {
    const doctorId = req.user!.id;
    const result = await pool.query(`SELECT u.id,u.name,u.email,u.phone,pp.dob,pp.gender,pp.blood_group,pp.allergies,pp.chronic_conditions,
      (SELECT COUNT(*) FROM appointments a WHERE a.patient_id=u.id AND a.doctor_id=$1)::int appointments_count,
      (SELECT MAX(visit_date) FROM medical_records m WHERE m.patient_id=u.id AND m.doctor_id=$1) last_visit
      FROM users u JOIN patient_profiles pp ON pp.user_id=u.id
      WHERE pp.linked_doctor_id=$1 ORDER BY u.name`, [doctorId]);
    res.json({ count: result.rowCount, patients: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not fetch doctor patients' }); }
}

export async function doctorSchedule(req: Request, res: Response) {
  try {
    const doctorId = req.user!.role === 'doctor' ? req.user!.id : req.params.doctorId;
    const result = await pool.query(`SELECT a.*,p.name patient_name,p.phone patient_phone FROM appointments a JOIN users p ON p.id=a.patient_id
      WHERE a.doctor_id=$1 AND a.appointment_date >= NOW() ORDER BY a.appointment_date LIMIT 100`, [doctorId]);
    res.json({ count: result.rowCount, appointments: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not fetch doctor schedule' }); }
}
