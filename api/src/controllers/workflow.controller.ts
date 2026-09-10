import { Request, Response } from 'express';
import { pool } from '../config/db';

export async function listDoctorApplications(_req: Request, res: Response) {
  try {
    const result = await pool.query(`SELECT u.id,u.name,u.email,u.phone,dp.specialization,dp.hospital_name,dv.registration_number,dv.qualifications,dv.document_url,dv.status,dv.rejection_reason,dv.created_at,dv.verified_at
      FROM doctor_verifications dv JOIN users u ON u.id=dv.doctor_id JOIN doctor_profiles dp ON dp.user_id=u.id ORDER BY dv.created_at DESC`);
    res.json({ count: result.rowCount, applications: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not fetch doctor applications' }); }
}

export async function updateDoctorVerification(req: Request, res: Response) {
  try {
    const { status, rejection_reason } = req.body;
    if (!['verified','rejected','pending'].includes(status)) return res.status(400).json({ error: 'Invalid verification status' });
    const result = await pool.query(`UPDATE doctor_verifications SET status=$1,rejection_reason=$2,verified_at=CASE WHEN $1='verified' THEN NOW() ELSE NULL END WHERE doctor_id=$3 RETURNING *`, [status,rejection_reason||null,req.params.doctorId]);
    if (!result.rowCount) return res.status(404).json({ error: 'Doctor verification record not found' });
    await pool.query(`UPDATE doctor_profiles SET is_available=CASE WHEN $1='verified' THEN true ELSE false END WHERE user_id=$2`, [status,req.params.doctorId]);
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not update doctor verification' }); }
}

export async function listConsents(req: Request, res: Response) {
  try {
    const patientId = req.user!.role === 'patient' ? req.user!.id : req.params.patientId;
    if (req.user!.role === 'patient' && req.params.patientId && req.params.patientId !== req.user!.id) return res.status(403).json({ error: 'Not authorized' });
    const result = await pool.query(`SELECT pc.*,u.name doctor_name FROM patient_consents pc LEFT JOIN users u ON u.id=pc.doctor_id WHERE pc.patient_id=$1 ORDER BY pc.granted_at DESC`, [patientId]);
    res.json({ count: result.rowCount, consents: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not fetch consents' }); }
}

export async function upsertConsent(req: Request, res: Response) {
  try {
    const patientId = req.user!.id;
    const { doctor_id, consent_type, granted=true } = req.body;
    if (!consent_type) return res.status(400).json({ error: 'consent_type is required' });
    const result = await pool.query(`INSERT INTO patient_consents(patient_id,doctor_id,consent_type,granted,revoked_at)
      VALUES($1,$2,$3,$4,CASE WHEN $4 THEN NULL ELSE NOW() END)
      ON CONFLICT(patient_id,doctor_id,consent_type) DO UPDATE SET granted=EXCLUDED.granted,granted_at=NOW(),revoked_at=EXCLUDED.revoked_at RETURNING *`, [patientId,doctor_id||null,consent_type,Boolean(granted)]);
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not update consent' }); }
}

export async function listDocuments(req: Request, res: Response) {
  try {
    const patientId = req.user!.role === 'patient' ? req.user!.id : req.params.patientId;
    if (req.user!.role === 'patient' && req.params.patientId && req.params.patientId !== req.user!.id) return res.status(403).json({ error: 'Not authorized' });
    const result = await pool.query(`SELECT md.*,u.name AS uploaded_by_name FROM medical_documents md LEFT JOIN users u ON u.id=md.uploaded_by WHERE md.patient_id=$1 ORDER BY md.created_at DESC`, [patientId]);
    res.json({ count: result.rowCount, documents: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not fetch medical documents' }); }
}

export async function addDocument(req: Request, res: Response) {
  try {
    const patientId = req.user!.role === 'patient' ? req.user!.id : req.body.patient_id;
    const { document_type, title, file_url, mime_type, file_size_bytes } = req.body;
    if (!patientId || !document_type || !title || !file_url) return res.status(400).json({ error: 'patient_id, document_type, title and file_url are required' });
    const result = await pool.query(`INSERT INTO medical_documents(patient_id,uploaded_by,document_type,title,file_url,mime_type,file_size_bytes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [patientId,req.user!.id,document_type,title,file_url,mime_type||null,file_size_bytes||null]);
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not create medical document' }); }
}
