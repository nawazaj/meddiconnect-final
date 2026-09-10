import { Request, Response } from 'express';
import { pool } from '../config/db';

export async function registerDonor(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const { blood_group, location, last_donation_date } = req.body;

    if (!blood_group) {
      return res.status(400).json({ error: 'blood_group is required' });
    }

    const result = await pool.query(
      `INSERT INTO blood_donors (user_id, blood_group, location, last_donation_date)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, blood_group, location || null, last_donation_date || null]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Register donor error:', err);
    return res.status(500).json({ error: 'Could not register donor' });
  }
}

export async function createBloodRequest(req: Request, res: Response) {
  try {
    const patientId = req.user!.id;
    const { blood_group, urgency, hospital_name } = req.body;

    if (!blood_group || !urgency) {
      return res.status(400).json({ error: 'blood_group and urgency are required' });
    }

    const result = await pool.query(
      `INSERT INTO blood_requests (patient_id, blood_group, urgency, hospital_name)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [patientId, blood_group, urgency, hospital_name || null]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create blood request error:', err);
    return res.status(500).json({ error: 'Could not create blood request' });
  }
}

// Simple matching: find available donors with the same blood group, most-recently-eligible first.
// (A 90-day safe-gap rule between donations is a good v2 addition - kept simple for the prototype.)
export async function findMatchingDonors(req: Request, res: Response) {
  try {
    const { bloodGroup } = req.params;

    const result = await pool.query(
      `SELECT bd.*, u.name AS donor_name, u.phone AS donor_phone
       FROM blood_donors bd
       JOIN users u ON u.id = bd.user_id
       WHERE bd.blood_group = $1 AND bd.available = true
       ORDER BY bd.last_donation_date ASC NULLS FIRST`,
      [bloodGroup]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error('Find donors error:', err);
    return res.status(500).json({ error: 'Could not find matching donors' });
  }
}

export async function listOpenRequests(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT br.*, u.name AS patient_name
       FROM blood_requests br
       JOIN users u ON u.id = br.patient_id
       WHERE br.status = 'open'
       ORDER BY
         CASE br.urgency
           WHEN 'critical' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           ELSE 4
         END,
         br.created_at ASC`
    );

    return res.json(result.rows);
  } catch (err) {
    console.error('List requests error:', err);
    return res.status(500).json({ error: 'Could not fetch open blood requests' });
  }
}


export async function updateDonorAvailability(req: Request, res: Response) {
  try {
    const { available } = req.body;
    const result = await pool.query(`UPDATE blood_donors SET available=$1 WHERE id=$2 AND user_id=$3 RETURNING *`, [Boolean(available), req.params.id, req.user!.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Donor record not found' });
    return res.json(result.rows[0]);
  } catch (err) { return res.status(500).json({ error: 'Could not update donor availability' }); }
}

export async function updateBloodRequest(req: Request, res: Response) {
  try {
    const result = await pool.query(`UPDATE blood_requests SET status=$1 WHERE id=$2 AND patient_id=$3 RETURNING *`, [req.body.status, req.params.id, req.user!.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Blood request not found' });
    return res.json(result.rows[0]);
  } catch (err) { return res.status(500).json({ error: 'Could not update blood request' }); }
}
