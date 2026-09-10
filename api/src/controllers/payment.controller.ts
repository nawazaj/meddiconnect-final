import { Request, Response } from 'express';
import { pool } from '../config/db';

export async function createPayment(req: Request, res: Response) {
  try {
    const { amount, purpose, order_id, appointment_id, provider = 'mock' } = req.body;
    if (amount == null || !purpose) return res.status(400).json({ error: 'amount and purpose are required' });
    const result = await pool.query(
      `INSERT INTO payments(user_id,order_id,appointment_id,amount,purpose,provider)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user!.id, order_id || null, appointment_id || null, amount, purpose, provider]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create payment error:', err);
    return res.status(500).json({ error: 'Could not create payment' });
  }
}

export async function updatePayment(req: Request, res: Response) {
  try {
    const { status, provider_payment_id } = req.body;
    if (!['pending','paid','failed','refunded'].includes(status)) return res.status(400).json({ error: 'Invalid payment status' });
    const result = await pool.query(
      `UPDATE payments SET status=$1,provider_payment_id=COALESCE($2,provider_payment_id) WHERE id=$3 RETURNING *`,
      [status, provider_payment_id || null, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Payment not found' });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Payment update error:', err);
    return res.status(500).json({ error: 'Could not update payment' });
  }
}

export async function listPayments(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT * FROM payments WHERE user_id=$1 ORDER BY created_at DESC`, [req.user!.id]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Payments error:', err);
    return res.status(500).json({ error: 'Could not fetch payments' });
  }
}
