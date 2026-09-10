import { Request, Response } from 'express';
import { pool } from '../config/db';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

// Patient sends a free-text daily check-in message.
// This calls the Python AI microservice to analyze severity, then stores the result.
// If flagged as serious, the patient's linked doctor should see it on their alerts dashboard
// (query for that is in getFlaggedCheckins below).
export async function submitCheckin(req: Request, res: Response) {
  try {
    const patientId = req.user!.id;
    const { message_text } = req.body;

    if (!message_text) {
      return res.status(400).json({ error: 'message_text is required' });
    }

    // Call the Python AI service
    const aiResponse = await fetch(`${AI_SERVICE_URL}/analyze-checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_id: patientId, message_text }),
    });

    if (!aiResponse.ok) {
      throw new Error(`AI service returned ${aiResponse.status}`);
    }

    const aiResult = (await aiResponse.json()) as {
      severity_score: number;
      severity_label: string;
      flagged: boolean;
      summary: string;
    };

    const result = await pool.query(
      `INSERT INTO ai_checkins
        (patient_id, message_text, severity_score, severity_label, flagged, ai_summary)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        patientId,
        message_text,
        aiResult.severity_score,
        aiResult.severity_label,
        aiResult.flagged,
        aiResult.summary,
      ]
    );

    if (aiResult.flagged) {
      const linked = await pool.query(`SELECT linked_doctor_id FROM patient_profiles WHERE user_id=$1`, [patientId]);
      if (linked.rows[0]?.linked_doctor_id) {
        await pool.query(
          `INSERT INTO notifications(user_id,type,title,message) VALUES($1,'ai_alert','AI health alert',$2)`,
          [linked.rows[0].linked_doctor_id, `Patient ${patientId} has a flagged AI check-in (${aiResult.severity_label}). Review the patient's latest check-in.`]
        );
      }
    }

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Checkin error:', err);
    // AI service being down shouldn't be a silent failure - the patient needs to know
    // their check-in wasn't processed, especially since this is a safety-relevant feature.
    return res.status(502).json({ error: 'Could not reach AI assistant service. Please try again.' });
  }
}

export async function getPatientCheckins(req: Request, res: Response) {
  try {
    const { patientId } = req.params;
    const user = req.user!;
    if (user.role === 'patient' && user.id !== patientId) return res.status(403).json({ error: 'You can only view your own check-ins' });
    if (user.role === 'doctor') {
      const linked = await pool.query(`SELECT 1 FROM patient_profiles WHERE user_id=$1 AND linked_doctor_id=$2`, [patientId, user.id]);
      if (!linked.rowCount) return res.status(403).json({ error: 'Patient is not linked to you' });
    }
    if (!['patient','doctor','admin'].includes(user.role)) return res.status(403).json({ error: 'Not authorized' });

    const result = await pool.query(
      `SELECT * FROM ai_checkins WHERE patient_id = $1 ORDER BY created_at DESC`,
      [patientId]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error('Get checkins error:', err);
    return res.status(500).json({ error: 'Could not fetch check-ins' });
  }
}

// Doctor's alert dashboard: all flagged check-ins for patients linked to this doctor
export async function getFlaggedCheckins(req: Request, res: Response) {
  try {
    const doctorId = req.user!.id;

    const result = await pool.query(
      `SELECT ac.*, u.name AS patient_name, u.phone AS patient_phone
       FROM ai_checkins ac
       JOIN users u ON u.id = ac.patient_id
       JOIN patient_profiles pp ON pp.user_id = ac.patient_id
       WHERE ac.flagged = true AND pp.linked_doctor_id = $1
       ORDER BY ac.created_at DESC`,
      [doctorId]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error('Get flagged checkins error:', err);
    return res.status(500).json({ error: 'Could not fetch flagged check-ins' });
  }
}
