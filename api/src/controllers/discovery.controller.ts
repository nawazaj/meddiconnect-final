import { Request, Response } from 'express';
import { pool } from '../config/db';

export async function platformOverview(_req: Request, res: Response) {
  try {
    const [doctors, patients, pharmacies, appointments, orders, donors, blood, emergencies] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int count, COUNT(*) FILTER (WHERE dp.is_available=true)::int available FROM users u JOIN doctor_profiles dp ON dp.user_id=u.id WHERE u.role='doctor'`),
      pool.query(`SELECT COUNT(*)::int count FROM users WHERE role='patient'`),
      pool.query(`SELECT COUNT(*)::int count, COUNT(*) FILTER (WHERE verified=true)::int verified FROM pharmacies`),
      pool.query(`SELECT COUNT(*)::int count, COUNT(*) FILTER (WHERE appointment_date >= NOW() AND status IN ('scheduled','confirmed'))::int upcoming FROM appointments`),
      pool.query(`SELECT COUNT(*)::int count, COALESCE(SUM(total_amount),0)::numeric total_value FROM medicine_orders WHERE status <> 'cancelled'`),
      pool.query(`SELECT COUNT(*)::int count FROM blood_donors WHERE available=true`),
      pool.query(`SELECT COUNT(*)::int count FROM blood_requests WHERE status IN ('open','matched')`),
      pool.query(`SELECT COUNT(*)::int count FROM emergency_requests WHERE status IN ('open','acknowledged')`),
    ]);
    res.json({
      doctors: doctors.rows[0], patients: patients.rows[0], pharmacies: pharmacies.rows[0],
      appointments: appointments.rows[0], medicine_orders: orders.rows[0],
      available_donors: donors.rows[0].count, active_blood_requests: blood.rows[0].count,
      active_emergencies: emergencies.rows[0].count,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not load platform overview' }); }
}

export async function listPharmacies(req: Request, res: Response) {
  try {
    const search = String(req.query.search || '').trim().toLowerCase();
    const city = String(req.query.location || '').trim().toLowerCase();
    const params: any[] = [];
    const conditions = ['p.verified=true'];
    if (search) { params.push(`%${search}%`); conditions.push(`(LOWER(p.shop_name) LIKE $${params.length} OR LOWER(COALESCE(p.address,'')) LIKE $${params.length})`); }
    if (city) { params.push(`%${city}%`); conditions.push(`LOWER(COALESCE(p.location,'')) LIKE $${params.length}`); }
    params.push(Math.min(Math.max(Number(req.query.limit)||30,1),100));
    const result = await pool.query(`SELECT p.*, u.name AS owner_name,
      COALESCE((SELECT COUNT(*) FROM pharmacy_inventory i WHERE i.pharmacy_id=p.id),0)::int AS inventory_items,
      COALESCE((SELECT COUNT(*) FROM medicine_orders o WHERE o.pharmacy_id=p.id AND o.status NOT IN ('delivered','cancelled')),0)::int AS active_orders
      FROM pharmacies p JOIN users u ON u.id=p.owner_user_id WHERE ${conditions.join(' AND ')} ORDER BY p.shop_name LIMIT $${params.length}`, params);
    res.json({ count: result.rowCount, pharmacies: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not fetch pharmacies' }); }
}

export async function pharmacyDetail(req: Request, res: Response) {
  try {
    const result = await pool.query(`SELECT p.*,u.name owner_name,u.phone owner_phone FROM pharmacies p JOIN users u ON u.id=p.owner_user_id WHERE p.id=$1`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Pharmacy not found' });
    const inventory = await pool.query(`SELECT id,medicine_name,generic_name,dosage,quantity,price,prescription_required FROM pharmacy_inventory WHERE pharmacy_id=$1 AND quantity>0 ORDER BY medicine_name`, [req.params.id]);
    res.json({ pharmacy: result.rows[0], inventory: inventory.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not fetch pharmacy' }); }
}

export async function bloodOverview(_req: Request, res: Response) {
  try {
    const [groups, locations, requests] = await Promise.all([
      pool.query(`SELECT blood_group, COUNT(*)::int AS donors FROM blood_donors WHERE available=true GROUP BY blood_group ORDER BY blood_group`),
      pool.query(`SELECT location, COUNT(*)::int AS donors FROM blood_donors WHERE available=true GROUP BY location ORDER BY donors DESC LIMIT 15`),
      pool.query(`SELECT urgency, COUNT(*)::int AS requests FROM blood_requests WHERE status IN ('open','matched') GROUP BY urgency ORDER BY CASE urgency WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END`),
    ]);
    res.json({ blood_groups: groups.rows, locations: locations.rows, active_requests_by_urgency: requests.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not load blood bank overview' }); }
}
