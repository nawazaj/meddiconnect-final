import { Request, Response } from 'express';
import { pool } from '../config/db';

export async function registerPharmacy(req: Request, res: Response) {
  try {
    const { shop_name, license_number, address, location } = req.body;
    if (!shop_name) return res.status(400).json({ error: 'shop_name is required' });
    const result = await pool.query(
      `INSERT INTO pharmacies (owner_user_id,shop_name,license_number,address,location)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user!.id, shop_name, license_number || null, address || null, location || null]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Register pharmacy error:', err);
    return res.status(500).json({ error: 'Could not register pharmacy' });
  }
}

export async function addInventory(req: Request, res: Response) {
  try {
    const { pharmacy_id, medicine_name, generic_name, dosage, quantity, price, prescription_required } = req.body;
    if (!pharmacy_id || !medicine_name) return res.status(400).json({ error: 'pharmacy_id and medicine_name are required' });
    if (req.user!.role === 'pharmacy') {
      const owner = await pool.query(`SELECT 1 FROM pharmacies WHERE id=$1 AND owner_user_id=$2`, [pharmacy_id, req.user!.id]);
      if (!owner.rowCount) return res.status(403).json({ error: 'You can only manage your own pharmacy inventory' });
    }
    const qty = Number(quantity ?? 0);
    const itemPrice = Number(price ?? 0);
    if (!Number.isInteger(qty) || qty < 0 || !Number.isFinite(itemPrice) || itemPrice < 0) {
      return res.status(400).json({ error: 'quantity must be a non-negative integer and price must be non-negative' });
    }
    const result = await pool.query(
      `INSERT INTO pharmacy_inventory
       (pharmacy_id,medicine_name,generic_name,dosage,quantity,price,prescription_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (pharmacy_id,medicine_name,dosage)
       DO UPDATE SET generic_name=EXCLUDED.generic_name,quantity=EXCLUDED.quantity,
                     price=EXCLUDED.price,prescription_required=EXCLUDED.prescription_required,updated_at=NOW()
       RETURNING *`,
      [pharmacy_id, medicine_name, generic_name || null, dosage || null,
       qty, itemPrice, prescription_required ?? true]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Inventory error:', err);
    return res.status(500).json({ error: 'Could not update inventory' });
  }
}

export async function searchInventory(req: Request, res: Response) {
  try {
    const q = String(req.query.q || '');
    const result = await pool.query(
      `SELECT i.*, p.shop_name, p.location FROM pharmacy_inventory i
       JOIN pharmacies p ON p.id=i.pharmacy_id
       WHERE p.verified=true AND i.quantity>0 AND i.medicine_name ILIKE $1
       ORDER BY i.medicine_name LIMIT 50`, [`%${q}%`]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Search inventory error:', err);
    return res.status(500).json({ error: 'Could not search medicines' });
  }
}

export async function createOrder(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const patientId = req.user!.id;
    const { pharmacy_id, prescription_id, delivery_address, items } = req.body;
    if (!pharmacy_id || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'pharmacy_id and items are required' });
    }
    const pharmacy = await client.query(`SELECT id FROM pharmacies WHERE id=$1 AND verified=true`, [pharmacy_id]);
    if (!pharmacy.rowCount) return res.status(404).json({ error: 'Verified pharmacy not found' });
    for (const item of items) {
      const qty = Number(item?.quantity);
      if (!item?.inventory_id || !Number.isInteger(qty) || qty <= 0) return res.status(400).json({ error: 'Each item needs a valid inventory_id and positive integer quantity' });
    }
    await client.query('BEGIN');
    const order = await client.query(
      `INSERT INTO medicine_orders(patient_id,pharmacy_id,prescription_id,delivery_address)
       VALUES($1,$2,$3,$4) RETURNING *`,
      [patientId, pharmacy_id, prescription_id || null, delivery_address || null]
    );
    let total = 0;
    for (const item of items) {
      const inv = await client.query(
        `SELECT * FROM pharmacy_inventory WHERE id=$1 AND pharmacy_id=$2 FOR UPDATE`,
        [item.inventory_id, pharmacy_id]
      );
      if (!inv.rowCount || inv.rows[0].quantity < Number(item.quantity)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `Insufficient stock for inventory item ${item.inventory_id}` });
      }
      const row = inv.rows[0];
      const qty = Number(item.quantity);
      total += Number(row.price) * qty;
      await client.query(`UPDATE pharmacy_inventory SET quantity=quantity-$1,updated_at=NOW() WHERE id=$2`, [qty, row.id]);
      await client.query(
        `INSERT INTO medicine_order_items(order_id,inventory_id,medicine_name,quantity,unit_price)
         VALUES($1,$2,$3,$4,$5)`,
        [order.rows[0].id,row.id,row.medicine_name,qty,row.price]
      );
    }
    const updated = await client.query(
      `UPDATE medicine_orders SET total_amount=$1,updated_at=NOW() WHERE id=$2 RETURNING *`,
      [total, order.rows[0].id]
    );
    await client.query('COMMIT');
    return res.status(201).json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create order error:', err);
    return res.status(500).json({ error: 'Could not create medicine order' });
  } finally {
    client.release();
  }
}

export async function listOrders(req: Request, res: Response) {
  try {
    const user = req.user!;
    const where = user.role === 'patient' ? 'o.patient_id=$1' : user.role === 'pharmacy' ? 'p.owner_user_id=$1' : 'TRUE';
    const params = user.role === 'admin' ? [] : [user.id];
    const result = await pool.query(
      `SELECT o.*, p.shop_name, u.name AS patient_name,
        COALESCE(json_agg(json_build_object('medicine_name',oi.medicine_name,'quantity',oi.quantity,'unit_price',oi.unit_price))
        FILTER (WHERE oi.id IS NOT NULL),'[]') AS items
       FROM medicine_orders o
       JOIN pharmacies p ON p.id=o.pharmacy_id
       JOIN users u ON u.id=o.patient_id
       LEFT JOIN medicine_order_items oi ON oi.order_id=o.id
       WHERE ${where}
       GROUP BY o.id,p.shop_name,u.name ORDER BY o.created_at DESC`,
      params
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('List orders error:', err);
    return res.status(500).json({ error: 'Could not fetch medicine orders' });
  }
}

export async function updateOrderStatus(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ['pending','confirmed','packed','out_for_delivery','delivered','cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid order status' });
    const result = await pool.query(
      `UPDATE medicine_orders o SET status=$1,updated_at=NOW()
       WHERE o.id=$2 AND ($3='admin' OR EXISTS (
         SELECT 1 FROM pharmacies p WHERE p.id=o.pharmacy_id AND p.owner_user_id=$4
       )) RETURNING o.*`,
      [status,id,req.user!.role,req.user!.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Order not found' });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Update order error:', err);
    return res.status(500).json({ error: 'Could not update order' });
  }
}
