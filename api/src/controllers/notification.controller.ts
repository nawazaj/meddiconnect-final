import { Request, Response } from 'express';
import { pool } from '../config/db';

export async function listNotifications(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`, [req.user!.id]
    );
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ error: 'Could not fetch notifications' });
  }
}

export async function markNotificationRead(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=$1 AND user_id=$2 RETURNING *`,
      [req.params.id, req.user!.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Notification not found' });
    return res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: 'Could not update notification' });
  }
}


export async function markAllNotificationsRead(req: Request, res: Response) {
  try {
    const result = await pool.query(`UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL RETURNING id`, [req.user!.id]);
    return res.json({ updated: result.rowCount });
  } catch (err) { return res.status(500).json({ error: 'Could not mark notifications as read' }); }
}
