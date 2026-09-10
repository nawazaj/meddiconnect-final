import { Request, Response } from 'express';
import { pool } from '../config/db';

const SPECIALTY_META: Record<string, { key: string; icon: string; description: string }> = {
  'General Physician': { key: 'general-physician', icon: 'stethoscope', description: 'Everyday health, fever, infections and preventive care' },
  'Cardiologist': { key: 'cardiology', icon: 'heart-pulse', description: 'Heart health, blood pressure and cardiac care' },
  'Dermatologist': { key: 'dermatology', icon: 'scan-face', description: 'Skin, hair, nails, acne and allergies' },
  'Orthopedic': { key: 'orthopedics', icon: 'bone', description: 'Bones, joints, injuries and mobility' },
  'Physiotherapist': { key: 'physiotherapy', icon: 'person-standing', description: 'Rehabilitation, posture and physical recovery' },
  'Pediatrician': { key: 'pediatrics', icon: 'baby', description: 'Healthcare for infants, children and teenagers' },
  'Gynecologist': { key: 'gynecology', icon: 'venus', description: 'Women’s health and gynecological care' },
  'Neurologist': { key: 'neurology', icon: 'brain', description: 'Brain, nerves, headaches and neurological care' },
  'ENT Specialist': { key: 'ent', icon: 'ear', description: 'Ear, nose, throat and respiratory care' },
  'Psychiatrist': { key: 'psychiatry', icon: 'brain', description: 'Mental health, mood and behavioural care' },
};


export async function listSpecializations(_req: Request, res: Response) {
  try {
    const result = await pool.query(`
      SELECT specialization, COUNT(*)::int AS doctor_count
      FROM doctor_profiles dp
      JOIN users u ON u.id = dp.user_id
      WHERE u.role='doctor' AND COALESCE(dp.is_available, true)=true
      GROUP BY specialization
      ORDER BY specialization ASC
    `);
    const specializations = result.rows.map((row) => ({
      name: row.specialization,
      count: row.doctor_count,
      ...(SPECIALTY_META[row.specialization] || { key: String(row.specialization || 'other').toLowerCase().replace(/[^a-z0-9]+/g, '-'), icon: 'stethoscope', description: 'Find a qualified healthcare professional' })
    }));
    return res.json({ specializations });
  } catch (err) {
    console.error('List specializations error:', err);
    return res.status(500).json({ error: 'Could not fetch specializations' });
  }
}

export async function listDoctors(req: Request, res: Response) {
  try {
    const { specialization, search, available, location, consultation_type, limit = '50', offset = '0' } = req.query;
    const params: any[] = [];
    const conditions = [`u.role='doctor'`, `COALESCE(dv.status, 'verified')='verified'`];

    if (specialization) {
      params.push(String(specialization));
      conditions.push(`LOWER(dp.specialization)=LOWER($${params.length})`);
    }
    if (search) {
      params.push(`%${String(search).toLowerCase()}%`);
      conditions.push(`(LOWER(u.name) LIKE $${params.length} OR LOWER(dp.specialization) LIKE $${params.length} OR LOWER(COALESCE(dp.hospital_name,'')) LIKE $${params.length})`);
    }
    if (location) {
      params.push(`%${String(location).toLowerCase()}%`);
      conditions.push(`(LOWER(COALESCE(dp.location,'')) LIKE $${params.length} OR LOWER(COALESCE(dp.hospital_name,'')) LIKE $${params.length})`);
    }
    if (available === 'true') conditions.push(`COALESCE(dp.is_available, true)=true`);
    if (available === 'false') conditions.push(`COALESCE(dp.is_available, true)=false`);

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    params.push(safeLimit, safeOffset);

    const result = await pool.query(`
      SELECT
        u.id, u.name, u.phone,
        dp.specialization, dp.hospital_name, dp.location,
        dp.years_experience, dp.bio, dp.profile_image_url,
        dp.languages, dp.consultation_fee, dp.rating, dp.review_count,
        COALESCE(dp.is_available, true) AS is_available,
        dp.next_available_at,
        COALESCE((SELECT COUNT(*) FROM appointments a WHERE a.doctor_id=u.id AND a.status IN ('scheduled','confirmed') AND a.appointment_date >= NOW()),0)::int AS upcoming_appointments
      FROM users u
      JOIN doctor_profiles dp ON dp.user_id=u.id
      LEFT JOIN doctor_verifications dv ON dv.doctor_id=u.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY COALESCE(dp.is_available,true) DESC, dp.rating DESC NULLS LAST, dp.years_experience DESC NULLS LAST, u.name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const doctors = result.rows.map((d) => ({
      ...d,
      languages: d.languages || [],
      consultation_fee: d.consultation_fee === null ? null : Number(d.consultation_fee),
      rating: d.rating === null ? null : Number(d.rating),
      availability_label: d.is_available ? 'Available' : 'Currently unavailable',
      profile: {
        display_name: d.name?.startsWith('Dr.') ? d.name : `Dr. ${d.name}`,
        specialty: d.specialization || 'General Physician',
        experience_label: d.years_experience ? `${d.years_experience}+ years experience` : null,
        fee_label: d.consultation_fee !== null ? `₹${Number(d.consultation_fee).toFixed(0)} consultation` : null,
      },
    }));

    return res.json({ count: doctors.length, limit: safeLimit, offset: safeOffset, doctors });
  } catch (err) {
    console.error('List doctors error:', err);
    return res.status(500).json({ error: 'Could not fetch doctors' });
  }
}

export async function getDoctor(req: Request, res: Response) {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.phone, u.email,
        dp.*,
        COALESCE((SELECT AVG(rating) FROM doctor_reviews dr WHERE dr.doctor_id=u.id), dp.rating, 0)::numeric(3,2) AS live_rating,
        COALESCE((SELECT COUNT(*) FROM doctor_reviews dr WHERE dr.doctor_id=u.id), dp.review_count, 0)::int AS live_review_count
      FROM users u JOIN doctor_profiles dp ON dp.user_id=u.id
      WHERE u.id=$1 AND u.role='doctor'
    `, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Doctor not found' });

    const d = result.rows[0];
    const slots = await pool.query(`
      SELECT appointment_date, duration_minutes, consultation_type
      FROM appointments
      WHERE doctor_id=$1 AND status IN ('scheduled','confirmed') AND appointment_date >= NOW()
      ORDER BY appointment_date ASC LIMIT 10
    `, [req.params.id]);

    return res.json({
      doctor: {
        ...d,
        display_name: `Dr. ${d.name}`,
        rating: Number(d.live_rating),
        review_count: Number(d.live_review_count),
        languages: d.languages || [],
        upcoming_bookings: slots.rows,
      }
    });
  } catch (err) {
    console.error('Get doctor error:', err);
    return res.status(500).json({ error: 'Could not fetch doctor' });
  }
}

export async function getDoctorAvailability(req: Request, res: Response) {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 30);
    const result = await pool.query(`
      SELECT day_of_week, start_time, end_time, consultation_types
      FROM doctor_availability
      WHERE doctor_id=$1 AND is_active=true
      ORDER BY day_of_week, start_time
    `, [req.params.id]);
    return res.json({ doctor_id: req.params.id, days, schedule: result.rows });
  } catch (err) {
    console.error('Doctor availability error:', err);
    return res.status(500).json({ error: 'Could not fetch doctor availability' });
  }
}


export async function listDoctorReviews(req: Request, res: Response) {
  try {
    const result = await pool.query(`
      SELECT r.id, r.rating, r.review_text, r.created_at, u.name AS patient_name
      FROM doctor_reviews r JOIN users u ON u.id=r.patient_id
      WHERE r.doctor_id=$1 ORDER BY r.created_at DESC LIMIT 50
    `, [req.params.id]);
    return res.json({ reviews: result.rows });
  } catch (err) {
    console.error('List doctor reviews error:', err);
    return res.status(500).json({ error: 'Could not fetch doctor reviews' });
  }
}

export async function createDoctorReview(req: Request, res: Response) {
  try {
    if (req.user!.role !== 'patient') return res.status(403).json({ error: 'Only patients can review doctors' });
    const { rating, review_text, appointment_id } = req.body;
    if (!rating || Number(rating) < 1 || Number(rating) > 5) return res.status(400).json({ error: 'rating must be between 1 and 5' });

    const doctor = await pool.query(`SELECT id FROM users WHERE id=$1 AND role='doctor'`, [req.params.id]);
    if (!doctor.rowCount) return res.status(404).json({ error: 'Doctor not found' });

    if (appointment_id) {
      const appt = await pool.query(`SELECT 1 FROM appointments WHERE id=$1 AND patient_id=$2 AND doctor_id=$3 AND status='completed'`, [appointment_id, req.user!.id, req.params.id]);
      if (!appt.rowCount) return res.status(400).json({ error: 'Review must be linked to your completed appointment' });
    }

    const result = await pool.query(`
      INSERT INTO doctor_reviews (doctor_id, patient_id, appointment_id, rating, review_text)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [req.params.id, req.user!.id, appointment_id || null, Number(rating), review_text || null]);

    await pool.query(`
      UPDATE doctor_profiles SET
        rating=(SELECT ROUND(AVG(rating)::numeric,1) FROM doctor_reviews WHERE doctor_id=$1),
        review_count=(SELECT COUNT(*) FROM doctor_reviews WHERE doctor_id=$1)
      WHERE user_id=$1
    `, [req.params.id]);

    return res.status(201).json({ review: result.rows[0] });
  } catch (err: any) {
    if (err?.code === '23505') return res.status(409).json({ error: 'You already reviewed this appointment' });
    console.error('Create doctor review error:', err);
    return res.status(500).json({ error: 'Could not create doctor review' });
  }
}


export async function featuredDoctors(req: Request, res: Response) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 20);
    const result = await pool.query(`
      SELECT u.id, u.name, dp.specialization, dp.hospital_name, dp.location,
        dp.years_experience, dp.profile_image_url, dp.languages, dp.consultation_fee,
        dp.rating, dp.review_count, dp.is_available, dp.next_available_at
      FROM users u JOIN doctor_profiles dp ON dp.user_id=u.id
      WHERE u.role='doctor'
      ORDER BY dp.rating DESC, dp.review_count DESC, dp.years_experience DESC
      LIMIT $1
    `, [limit]);
    res.json({ doctors: result.rows.map(formatDoctorCard) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not fetch featured doctors' }); }
}

export async function doctorsBySpecialty(req: Request, res: Response) {
  try {
    const specialty = String(req.params.specialization || '').trim();
    const result = await pool.query(`
      SELECT u.id, u.name, dp.specialization, dp.hospital_name, dp.location,
        dp.years_experience, dp.bio, dp.profile_image_url, dp.languages,
        dp.consultation_fee, dp.rating, dp.review_count, dp.is_available, dp.next_available_at
      FROM users u JOIN doctor_profiles dp ON dp.user_id=u.id
      WHERE u.role='doctor' AND LOWER(dp.specialization)=LOWER($1)
      ORDER BY dp.is_available DESC, dp.rating DESC, u.name ASC
    `, [specialty]);
    res.json({ specialization: specialty, count: result.rowCount, doctors: result.rows.map(formatDoctorCard) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not fetch specialty doctors' }); }
}

export async function topRatedDoctors(req: Request, res: Response) {
  try {
    const minRating = Math.min(Math.max(Number(req.query.min_rating) || 4.5, 0), 5);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const result = await pool.query(`
      SELECT u.id, u.name, dp.specialization, dp.hospital_name, dp.location,
        dp.years_experience, dp.profile_image_url, dp.languages, dp.consultation_fee,
        dp.rating, dp.review_count, dp.is_available, dp.next_available_at
      FROM users u JOIN doctor_profiles dp ON dp.user_id=u.id
      WHERE u.role='doctor' AND dp.rating >= $1
      ORDER BY dp.rating DESC, dp.review_count DESC
      LIMIT $2
    `, [minRating, limit]);
    res.json({ min_rating: minRating, doctors: result.rows.map(formatDoctorCard) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not fetch top-rated doctors' }); }
}

export async function availableDoctors(req: Request, res: Response) {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, dp.specialization, dp.hospital_name, dp.location,
        dp.years_experience, dp.profile_image_url, dp.languages, dp.consultation_fee,
        dp.rating, dp.review_count, dp.next_available_at
      FROM users u JOIN doctor_profiles dp ON dp.user_id=u.id
      WHERE u.role='doctor' AND COALESCE(dp.is_available,true)=true
      ORDER BY dp.next_available_at NULLS LAST, dp.rating DESC, u.name ASC
      LIMIT 100
    `);
    res.json({ count: result.rowCount, doctors: result.rows.map((d) => ({ ...formatDoctorCard(d), availability_label: 'Available now' })) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not fetch available doctors' }); }
}

export async function doctorHospitals(_req: Request, res: Response) {
  try {
    const result = await pool.query(`
      SELECT dp.hospital_name AS name, dp.location,
        COUNT(*)::int AS doctor_count,
        COUNT(*) FILTER (WHERE dp.is_available)::int AS available_doctors,
        ROUND(AVG(dp.rating)::numeric,1) AS average_rating
      FROM doctor_profiles dp JOIN users u ON u.id=dp.user_id
      WHERE u.role='doctor' AND dp.hospital_name IS NOT NULL
      GROUP BY dp.hospital_name, dp.location
      ORDER BY doctor_count DESC, average_rating DESC
    `);
    res.json({ hospitals: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not fetch hospitals' }); }
}

export async function doctorStats(_req: Request, res: Response) {
  try {
    const result = await pool.query(`
      SELECT COUNT(*)::int AS total_doctors,
        COUNT(*) FILTER (WHERE dp.is_available)::int AS available_doctors,
        COUNT(DISTINCT dp.specialization)::int AS specialties,
        ROUND(AVG(dp.rating)::numeric,2) AS average_rating,
        COUNT(DISTINCT dp.hospital_name)::int AS hospitals
      FROM doctor_profiles dp JOIN users u ON u.id=dp.user_id
      WHERE u.role='doctor'
    `);
    const specialties = await pool.query(`SELECT specialization, COUNT(*)::int AS count FROM doctor_profiles GROUP BY specialization ORDER BY count DESC, specialization`);
    res.json({ ...result.rows[0], specialties: specialties.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not fetch doctor statistics' }); }
}

export async function doctorSearchSuggestions(req: Request, res: Response) {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ suggestions: [] });
    const like = `%${q.toLowerCase()}%`;
    const result = await pool.query(`
      SELECT DISTINCT specialization AS value, 'specialization' AS type FROM doctor_profiles WHERE LOWER(specialization) LIKE $1
      UNION ALL
      SELECT DISTINCT hospital_name AS value, 'hospital' AS type FROM doctor_profiles WHERE LOWER(hospital_name) LIKE $1
      UNION ALL
      SELECT name AS value, 'doctor' AS type FROM users WHERE role='doctor' AND LOWER(name) LIKE $1
      ORDER BY type, value LIMIT 15
    `, [like]);
    res.json({ suggestions: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not fetch search suggestions' }); }
}

export async function doctorSlots(req: Request, res: Response) {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 14);
    const doctor = await pool.query(
      `SELECT u.id,u.name,COALESCE(dp.is_available,true) AS is_available
       FROM users u LEFT JOIN doctor_profiles dp ON dp.user_id=u.id
       WHERE u.id=$1 AND u.role='doctor'`,
      [req.params.id]
    );
    if (!doctor.rowCount) return res.status(404).json({ error: 'Doctor not found' });

    // Self-heal a demo/local database where availability was not seeded.
    await pool.query(`
      INSERT INTO doctor_availability
        (doctor_id,day_of_week,start_time,end_time,consultation_types,is_active)
      SELECT $1,d,'09:00'::time,'18:00'::time,
             ARRAY['in_person','video','audio']::text[],true
      FROM generate_series(0,6) d
      WHERE NOT EXISTS (
        SELECT 1 FROM doctor_availability da
        WHERE da.doctor_id=$1
          AND da.day_of_week=d
          AND da.is_active=true
      )
      ON CONFLICT DO NOTHING
    `, [req.params.id]);

    // Return actual 30-minute slots, excluding already booked appointments.
    // This makes the frontend and booking endpoint use exactly the same model.
    const result = await pool.query(`
      WITH clinic_days AS (
        SELECT gs::date AS date,
               EXTRACT(DOW FROM gs)::int AS day_of_week
        FROM generate_series(
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date,
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + ($2 - 1) * INTERVAL '1 day',
          INTERVAL '1 day'
        ) gs
      ),
      windows AS (
        SELECT cd.date, cd.day_of_week,
               da.start_time, da.end_time, da.consultation_types
        FROM clinic_days cd
        JOIN doctor_availability da
          ON da.doctor_id=$1
         AND da.day_of_week=cd.day_of_week
         AND da.is_active=true
      ),
      slots AS (
        SELECT w.date,
               w.day_of_week,
               gs AS slot_start,
               (gs + INTERVAL '30 minutes') AS slot_end,
               w.consultation_types
        FROM windows w
        CROSS JOIN LATERAL generate_series(
          w.date + w.start_time,
          w.date + w.end_time - INTERVAL '30 minutes',
          INTERVAL '30 minutes'
        ) gs
      )
      SELECT
        s.date,
        s.day_of_week,
        TO_CHAR(s.slot_start,'HH24:MI:SS') AS start_time,
        TO_CHAR(s.slot_end,'HH24:MI:SS') AS end_time,
        s.consultation_types
      FROM slots s
      WHERE s.slot_start > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')
        AND NOT EXISTS (
          SELECT 1
          FROM appointments a
          WHERE a.doctor_id=$1
            AND a.status IN ('scheduled','confirmed')
            AND a.appointment_date < s.slot_end
            AND a.appointment_date + (a.duration_minutes * INTERVAL '1 minute') > s.slot_start
        )
      ORDER BY s.date, s.slot_start
    `, [req.params.id, days]);

    return res.json({
      doctor: doctor.rows[0],
      days,
      slots: result.rows
    });
  } catch (err) {
    console.error('Doctor slots error:', err);
    return res.status(500).json({ error: 'Could not fetch doctor slots' });
  }
}

function formatDoctorCard(d: any) {
  return {
    id: d.id,
    name: d.name,
    display_name: d.name?.startsWith('Dr.') ? d.name : `Dr. ${d.name}`,
    specialization: d.specialization || 'General Physician',
    hospital: d.hospital_name,
    location: d.location,
    experience: d.years_experience,
    experience_label: d.years_experience ? `${d.years_experience}+ years experience` : null,
    bio: d.bio || null,
    image: d.profile_image_url || null,
    languages: d.languages || [],
    consultation_fee: d.consultation_fee === null || d.consultation_fee === undefined ? null : Number(d.consultation_fee),
    fee_label: d.consultation_fee !== null && d.consultation_fee !== undefined ? `₹${Number(d.consultation_fee).toFixed(0)}` : null,
    rating: d.rating === null || d.rating === undefined ? null : Number(d.rating),
    reviews: Number(d.review_count || 0),
    available: Boolean(d.is_available),
    next_available_at: d.next_available_at || null
  };
}
