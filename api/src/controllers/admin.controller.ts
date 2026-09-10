import { Request, Response } from 'express';
import { pool } from '../config/db';

export async function dashboard(req: Request, res: Response) {
  try {
    const [users, records, appointments, orders, blood, emergencies, flagged] = await Promise.all([
      pool.query(`SELECT role,COUNT(*)::int AS count FROM users GROUP BY role`),
      pool.query(`SELECT COUNT(*)::int AS count FROM medical_records`),
      pool.query(`SELECT COUNT(*)::int AS count FROM appointments WHERE appointment_date >= NOW() AND status IN ('scheduled','confirmed')`),
      pool.query(`SELECT COUNT(*)::int AS count FROM medicine_orders WHERE status NOT IN ('delivered','cancelled')`),
      pool.query(`SELECT blood_group,COUNT(*)::int AS donors FROM blood_donors WHERE available=true GROUP BY blood_group ORDER BY blood_group`),
      pool.query(`SELECT COUNT(*)::int AS count FROM emergency_requests WHERE status IN ('open','acknowledged')`),
      pool.query(`SELECT COUNT(*)::int AS count FROM ai_checkins WHERE flagged=true AND created_at >= NOW()-INTERVAL '7 days'`)
    ]);
    return res.json({
      users_by_role: users.rows,
      medical_records: records.rows[0].count,
      upcoming_appointments: appointments.rows[0].count,
      active_orders: orders.rows[0].count,
      available_donors: blood.rows,
      active_emergencies: emergencies.rows[0].count,
      flagged_checkins_last_7_days: flagged.rows[0].count
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    return res.status(500).json({ error: 'Could not load dashboard analytics' });
  }
}

export async function listUsers(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT id,name,email,role,phone,created_at FROM users ORDER BY created_at DESC LIMIT 500`
    );
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ error: 'Could not fetch users' });
  }
}

export async function analytics(req: Request, res: Response) {
  try {
    const days = Math.min(Math.max(Number(req.query.days || 14), 7), 90);
    const [dailyAppointments, dailyCheckins, dailyOrders, dailyUsers, payments, topDoctors, inventory] = await Promise.all([
      pool.query(`SELECT DATE(appointment_date) AS day, COUNT(*)::int AS count FROM appointments WHERE appointment_date >= CURRENT_DATE - ($1::int - 1) GROUP BY 1 ORDER BY 1`, [days]),
      pool.query(`SELECT DATE(created_at) AS day, COUNT(*)::int AS count, COUNT(*) FILTER (WHERE flagged)::int AS flagged FROM ai_checkins WHERE created_at >= CURRENT_DATE - ($1::int - 1) GROUP BY 1 ORDER BY 1`, [days]),
      pool.query(`SELECT DATE(created_at) AS day, COUNT(*)::int AS count, COALESCE(SUM(total_amount),0)::numeric AS revenue FROM medicine_orders WHERE created_at >= CURRENT_DATE - ($1::int - 1) GROUP BY 1 ORDER BY 1`, [days]),
      pool.query(`SELECT DATE(created_at) AS day, COUNT(*)::int AS count FROM users WHERE created_at >= CURRENT_DATE - ($1::int - 1) GROUP BY 1 ORDER BY 1`, [days]),
      pool.query(`SELECT status, COUNT(*)::int AS count, COALESCE(SUM(amount),0)::numeric AS amount FROM payments GROUP BY status ORDER BY status`),
      pool.query(`SELECT u.id,u.name,dp.specialization,dp.rating,dp.review_count,COUNT(a.id)::int AS appointments FROM doctor_profiles dp JOIN users u ON u.id=dp.user_id LEFT JOIN appointments a ON a.doctor_id=u.id AND a.created_at >= CURRENT_DATE - INTERVAL '30 days' GROUP BY u.id,u.name,dp.specialization,dp.rating,dp.review_count ORDER BY appointments DESC,dp.rating DESC LIMIT 8`),
      pool.query(`SELECT medicine_name, SUM(quantity)::int AS quantity, COUNT(*)::int AS listings FROM pharmacy_inventory GROUP BY medicine_name ORDER BY quantity ASC LIMIT 12`)
    ]);
    res.json({ days, daily_appointments: dailyAppointments.rows, daily_checkins: dailyCheckins.rows, daily_orders: dailyOrders.rows, daily_users: dailyUsers.rows, payments: payments.rows, top_doctors: topDoctors.rows, low_stock: inventory.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not load analytics' }); }
}

export async function auditLogs(req: Request, res: Response) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 300);
    const result = await pool.query(`SELECT al.id,al.action,al.entity_type,al.entity_id,al.metadata,al.ip_address,al.created_at,u.name AS actor_name,u.email AS actor_email,u.role AS actor_role FROM audit_logs al LEFT JOIN users u ON u.id=al.actor_user_id ORDER BY al.created_at DESC LIMIT $1`, [limit]);
    res.json({ count: result.rowCount, logs: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not load audit logs' }); }
}

export async function systemHealth(_req: Request, res: Response) {
  try {
    const started = Date.now();
    const [db, tables] = await Promise.all([
      pool.query('SELECT NOW() AS server_time, current_database() AS database'),
      pool.query(`SELECT relname AS table_name, n_live_tup::bigint AS rows FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY relname`)
    ]);
    res.json({ status: 'operational', database: db.rows[0], latency_ms: Date.now() - started, tables: tables.rows });
  } catch (err) { console.error(err); res.status(503).json({ status: 'degraded', error: 'Database health check failed' }); }
}

export async function operationalQueues(_req: Request, res: Response) {
  try {
    const [emergencies, appointments, orders, blood] = await Promise.all([
      pool.query(`SELECT er.*,u.name AS patient_name,u.phone AS patient_phone FROM emergency_requests er JOIN users u ON u.id=er.patient_id WHERE er.status IN ('open','acknowledged') ORDER BY CASE er.severity WHEN 'critical' THEN 1 ELSE 2 END, er.created_at DESC LIMIT 50`),
      pool.query(`SELECT a.*,p.name AS patient_name,d.name AS doctor_name,dp.specialization FROM appointments a JOIN users p ON p.id=a.patient_id JOIN users d ON d.id=a.doctor_id LEFT JOIN doctor_profiles dp ON dp.user_id=d.id WHERE a.appointment_date >= NOW() ORDER BY a.appointment_date LIMIT 50`),
      pool.query(`SELECT mo.*,p.name AS patient_name,ph.shop_name FROM medicine_orders mo JOIN users p ON p.id=mo.patient_id JOIN pharmacies ph ON ph.id=mo.pharmacy_id WHERE mo.status NOT IN ('delivered','cancelled') ORDER BY mo.created_at DESC LIMIT 50`),
      pool.query(`SELECT br.*,u.name AS patient_name FROM blood_requests br JOIN users u ON u.id=br.patient_id WHERE br.status='open' ORDER BY CASE br.urgency WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,br.created_at DESC LIMIT 50`)
    ]);
    res.json({ emergencies: emergencies.rows, appointments: appointments.rows, orders: orders.rows, blood_requests: blood.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not load operational queues' }); }
}

export async function broadcast(req: Request, res: Response) {
  try {
    const { title, message, type='admin_broadcast', role } = req.body || {};
    if (!title || !message) return res.status(400).json({ error: 'title and message are required' });
    const validRole = ['patient','doctor','pharmacy','blood_bank','admin'].includes(role);
    const result = validRole
      ? await pool.query(`INSERT INTO notifications(user_id,type,title,message) SELECT id,$3,$1,$2 FROM users WHERE role=$4 RETURNING id`, [title,message,type,role])
      : await pool.query(`INSERT INTO notifications(user_id,type,title,message) SELECT id,$3,$1,$2 FROM users RETURNING id`, [title,message,type]);
    await pool.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,metadata) VALUES($1,'broadcast_notification','notifications',$2::jsonb)`, [req.user!.id, JSON.stringify({ title, role: validRole ? role : 'all', recipient_count: result.rowCount })]);
    res.status(201).json({ sent: result.rowCount, title, role: validRole ? role : 'all' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not send broadcast' }); }
}

export async function updateEmergencyStatus(req: Request, res: Response) {
  try {
    const { status } = req.body || {};
    if (!['open','acknowledged','resolved','cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid emergency status' });
    const result = await pool.query(`UPDATE emergency_requests SET status=$1,resolved_at=CASE WHEN $1='resolved' THEN NOW() ELSE NULL END WHERE id=$2 RETURNING *`, [status,req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Emergency request not found' });
    await pool.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,'update_emergency_status','emergency_request',$2,$3::jsonb)`, [req.user!.id,req.params.id,JSON.stringify({status})]);
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not update emergency' }); }
}

export async function updateOrderStatus(req: Request, res: Response) {
  try {
    const allowed=['pending','confirmed','packed','out_for_delivery','delivered','cancelled'];
    const { status }=req.body||{};
    if(!allowed.includes(status)) return res.status(400).json({error:'Invalid order status'});
    const result=await pool.query(`UPDATE medicine_orders SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *`,[status,req.params.id]);
    if(!result.rowCount) return res.status(404).json({error:'Order not found'});
    await pool.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,'update_order_status','medicine_order',$2,$3::jsonb)`,[req.user!.id,req.params.id,JSON.stringify({status})]);
    res.json(result.rows[0]);
  }catch(err){console.error(err);res.status(500).json({error:'Could not update order'});}
}


export async function userActivity(req: Request, res: Response) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 200), 1), 500);
    const userId = req.query.user_id ? String(req.query.user_id) : null;
    const result = await pool.query(`
      SELECT al.id, al.actor_user_id AS user_id, u.name AS user_name, u.email, u.role,
             al.action, al.entity_type, al.entity_id, al.metadata, al.created_at
      FROM audit_logs al
      JOIN users u ON u.id=al.actor_user_id
      WHERE u.role <> 'admin'
        AND ($1::uuid IS NULL OR al.actor_user_id=$1::uuid)
      ORDER BY al.created_at DESC
      LIMIT $2
    `, [userId, limit]);
    const summary = await pool.query(`
      SELECT u.role, COUNT(*)::int AS events
      FROM audit_logs al JOIN users u ON u.id=al.actor_user_id
      WHERE u.role <> 'admin' AND ($1::uuid IS NULL OR al.actor_user_id=$1::uuid)
      GROUP BY u.role ORDER BY events DESC
    `, [userId]);
    return res.json({ count: result.rowCount, events: result.rows, summary: summary.rows });
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Could not load user activity' }); }
}
