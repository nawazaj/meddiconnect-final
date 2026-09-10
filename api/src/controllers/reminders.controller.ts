import { Request, Response } from 'express';
import { pool } from '../config/db';

// Create a reminder slot for a prescription (e.g. 8:00 AM dose)
export async function createReminder(req: Request, res: Response) {
  try {
    const { prescription_id, patient_id: requestedPatientId, time_of_day, stock_remaining } = req.body;
    const patient_id = req.user!.role === 'patient' ? req.user!.id : requestedPatientId;

    if (!prescription_id || !patient_id || !time_of_day) {
      return res
        .status(400)
        .json({ error: 'prescription_id, patient_id and time_of_day are required' });
    }

    if (req.user!.role === 'doctor') {
      const linked = await pool.query(`SELECT 1 FROM patient_profiles WHERE user_id=$1 AND linked_doctor_id=$2`, [patient_id, req.user!.id]);
      if (!linked.rowCount) return res.status(403).json({ error: 'Patient is not linked to you' });
    }
    const prescription = await pool.query(`SELECT id FROM prescriptions WHERE id=$1 AND patient_id=$2`, [prescription_id, patient_id]);
    if (!prescription.rowCount) return res.status(404).json({ error: 'Prescription not found for patient' });
    const stock = Number(stock_remaining ?? 0);
    if (!Number.isInteger(stock) || stock < 0) return res.status(400).json({ error: 'stock_remaining must be a non-negative integer' });
    const result = await pool.query(
      `INSERT INTO medicine_reminders (prescription_id, patient_id, time_of_day, stock_remaining)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [prescription_id, patient_id, time_of_day, stock]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create reminder error:', err);
    return res.status(500).json({ error: 'Could not create reminder' });
  }
}

// Get all reminders for a patient (used to render "today's medicines" screen)
export async function getPatientReminders(req: Request, res: Response) {
  try {
    const { patientId } = req.params;
    if (req.user!.role === 'patient' && req.user!.id !== patientId) return res.status(403).json({ error: 'You can only view your own reminders' });
    if (!['patient','doctor','admin'].includes(req.user!.role)) return res.status(403).json({ error: 'Not authorized' });

    const result = await pool.query(
      `SELECT r.*, p.medicine_name, p.dosage
       FROM medicine_reminders r
       JOIN prescriptions p ON p.id = r.prescription_id
       WHERE r.patient_id = $1
       ORDER BY r.time_of_day ASC`,
      [patientId]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error('Get reminders error:', err);
    return res.status(500).json({ error: 'Could not fetch reminders' });
  }
}

// Mark a dose as taken, and decrement stock by 1 (low-stock logic lives here)
export async function markTaken(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE medicine_reminders
       SET taken_today = true,
           stock_remaining = GREATEST(stock_remaining - 1, 0)
       WHERE id = $1 AND patient_id = $2
       RETURNING *`,
      [id, req.user!.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    const reminder = result.rows[0];
    const lowStock = reminder.stock_remaining <= 3;

    return res.json({ reminder, low_stock_alert: lowStock });
  } catch (err) {
    console.error('Mark taken error:', err);
    return res.status(500).json({ error: 'Could not update reminder' });
  }
}
