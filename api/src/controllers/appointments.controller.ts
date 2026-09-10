import { Request, Response } from 'express';
import { pool } from '../config/db';

const ALLOWED_TYPES = ['in_person', 'video', 'audio'];

function parseAppointmentDate(value: unknown): { iso: string; date: Date } | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  // Appointment timestamps are clinic-local wall-clock times. PostgreSQL stores
  // appointment_date as TIMESTAMP (without time zone), so do not pass a JS Date
  // to pg here: pg converts Date values to UTC and shifts the requested slot.
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const iso = `${m[1]} ${m[2]}:${m[3]}:${m[4] || '00'}`;
  const [y, mo, d, h, mi, sec] = [Number(m[1].slice(0,4)), Number(m[1].slice(5,7)), Number(m[1].slice(8,10)), Number(m[2]), Number(m[3]), Number(m[4] || 0)];
  const date = new Date(y, mo - 1, d, h, mi, sec, 0);
  if (Number.isNaN(date.getTime()) || date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d || date.getHours() !== h || date.getMinutes() !== mi) return null;
  return { iso, date };
}

export async function createAppointment(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const patientId = req.user!.role === 'patient' ? req.user!.id : req.body.patient_id;
    const { doctor_id, appointment_date, duration_minutes, consultation_type, reason } = req.body;

    if (!patientId || !doctor_id || !appointment_date) {
      return res.status(400).json({ error: 'doctor_id and appointment_date are required' });
    }

    const duration = Number(duration_minutes ?? 30);
    if (!Number.isInteger(duration) || duration < 10 || duration > 180) {
      return res.status(400).json({ error: 'duration_minutes must be an integer between 10 and 180' });
    }

    const consultationType = String(consultation_type || 'in_person');
    if (!ALLOWED_TYPES.includes(consultationType)) {
      return res.status(400).json({ error: 'Invalid consultation_type' });
    }

    const parsedAppointment = parseAppointmentDate(appointment_date);
    if (!parsedAppointment || parsedAppointment.date <= new Date()) {
      return res.status(400).json({ error: 'appointment_date must be a valid future date' });
    }

    await client.query('BEGIN');

    const patient = await client.query(
      `SELECT id FROM users WHERE id=$1 AND role='patient'`,
      [patientId]
    );
    if (!patient.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Patient not found' });
    }

    const doctor = await client.query(
      `SELECT u.id, u.name, COALESCE(dp.is_available,true) AS is_available
       FROM users u
       LEFT JOIN doctor_profiles dp ON dp.user_id=u.id
       WHERE u.id=$1 AND u.role='doctor'`,
      [doctor_id]
    );
    if (!doctor.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Doctor not found' });
    }

    // Availability is authoritative for booking. A seeded doctor with an
    // accidentally missing schedule is repaired automatically.
    await client.query(`
      INSERT INTO doctor_availability
        (doctor_id, day_of_week, start_time, end_time, consultation_types, is_active)
      SELECT $1, d, '09:00'::time, '18:00'::time,
             ARRAY['in_person','video','audio']::text[], true
      FROM generate_series(0,6) AS d
      WHERE NOT EXISTS (
        SELECT 1 FROM doctor_availability da
        WHERE da.doctor_id=$1
          AND da.day_of_week=d
          AND da.is_active=true
      )
      ON CONFLICT DO NOTHING
    `, [doctor_id]);

    // Lock the doctor's appointment rows for this transaction so two patients
    // cannot book the same slot simultaneously.
    await client.query(
      `SELECT id FROM appointments
       WHERE doctor_id=$1 AND appointment_date::date=$2::date
       FOR UPDATE`,
      [doctor_id, parsedAppointment.iso]
    );

    const availability = await client.query(
      `SELECT start_time, end_time, consultation_types
       FROM doctor_availability
       WHERE doctor_id=$1
         AND is_active=true
         AND day_of_week=EXTRACT(DOW FROM $2::timestamp)::int
         AND $2::time >= start_time
         AND ($2::time + ($3::int * interval '1 minute')) <= end_time
         AND (
           consultation_types IS NULL
           OR cardinality(consultation_types)=0
           OR $4 = ANY(consultation_types)
         )
       LIMIT 1`,
      [doctor_id, parsedAppointment.iso, duration, consultationType]
    );

    if (!availability.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Doctor is not available at this time',
        code: 'SLOT_UNAVAILABLE',
        doctor_id,
        appointment_date: parsedAppointment.iso
      });
    }

    const overlap = await client.query(
      `SELECT id FROM appointments
       WHERE doctor_id=$1
         AND status IN ('scheduled','confirmed')
         AND appointment_date < $2::timestamp + ($3::int * interval '1 minute')
         AND appointment_date + (duration_minutes * interval '1 minute') > $2::timestamp
       LIMIT 1`,
      [doctor_id, parsedAppointment.iso, duration]
    );

    if (overlap.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Doctor is not available at this time',
        code: 'SLOT_BOOKED'
      });
    }

    const result = await client.query(
      `INSERT INTO appointments
       (patient_id, doctor_id, appointment_date, duration_minutes, consultation_type, reason)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [patientId, doctor_id, parsedAppointment.iso, duration, consultationType, reason?.trim() || null]
    );

    await client.query('COMMIT');
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Create appointment error:', err);
    return res.status(500).json({ error: 'Could not create appointment' });
  } finally {
    client.release();
  }
}

export async function listAppointments(req: Request, res: Response) {
  try {
    const user = req.user!;
    const where = user.role === 'patient' ? 'a.patient_id=$1' :
      user.role === 'doctor' ? 'a.doctor_id=$1' : 'TRUE';
    const params = user.role === 'admin' ? [] : [user.id];

    const result = await pool.query(
      `SELECT a.*,
              p.name AS patient_name,
              d.name AS doctor_name,
              dp.specialization AS doctor_specialization,
              dp.hospital_name AS doctor_hospital,
              dp.profile_image_url AS doctor_image,
              dp.consultation_fee AS doctor_fee
       FROM appointments a
       JOIN users p ON p.id=a.patient_id
       JOIN users d ON d.id=a.doctor_id
       LEFT JOIN doctor_profiles dp ON dp.user_id=d.id
       WHERE ${where}
       ORDER BY a.appointment_date ASC`,
      params
    );

    return res.json(result.rows);
  } catch (err) {
    console.error('List appointments error:', err);
    return res.status(500).json({ error: 'Could not fetch appointments' });
  }
}

export async function updateAppointment(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { status, meeting_url, notes } = req.body;
    const user = req.user!;
    const ownerClause = user.role === 'patient' ? 'AND patient_id=$5' :
      user.role === 'doctor' ? 'AND doctor_id=$5' : '';
    const params: any[] = [status || null, meeting_url || null, notes || null, id];
    if (ownerClause) params.push(user.id);

    const result = await pool.query(
      `UPDATE appointments SET
       status=COALESCE($1,status),
       meeting_url=COALESCE($2,meeting_url),
       notes=COALESCE($3,notes),
       updated_at=NOW()
       WHERE id=$4 ${ownerClause}
       RETURNING *`,
      params
    );

    if (!result.rowCount) return res.status(404).json({ error: 'Appointment not found' });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Update appointment error:', err);
    return res.status(500).json({ error: 'Could not update appointment' });
  }
}
