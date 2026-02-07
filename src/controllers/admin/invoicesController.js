const db = require('../../db');

function addMonths(date, months) {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Ajustar fin de mes si el mes siguiente no tiene el mismo día
  if (d.getDate() < day) {
    d.setDate(0);
  }
  return d;
}

exports.listPending = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT i.*, s.plan_id, s.negocio_id, s.status AS subscription_status, p.nombre AS plan_nombre,
              n.nombre AS negocio_nombre
       FROM invoices i
       LEFT JOIN subscriptions s ON s.id = i.subscription_id
       LEFT JOIN plans p ON p.id = s.plan_id
       LEFT JOIN negocios n ON n.id = i.negocio_id
       WHERE i.pagado = FALSE
       ORDER BY i.created_at DESC`
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.confirm = async (req, res) => {
  const client = await db.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');
    // Lock only the invoice row to avoid FOR UPDATE on nullable join sides
    const invRes = await client.query(
      `SELECT * FROM invoices WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (invRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Factura no encontrada' });
    }
    const invoice = invRes.rows[0];
    if (invoice.pagado) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'La factura ya está pagada' });
    }

    // Fetch subscription + plan data without locking nullable join sides
    const subRes = await client.query(
      `SELECT s.id AS sub_id, s.current_period_end, s.next_billing_date, s.status AS subscription_status,
              s.plan_id, p.intervalo, p.nombre AS plan_nombre
       FROM subscriptions s
       LEFT JOIN plans p ON p.id = s.plan_id
       WHERE s.id = $1`,
      [invoice.subscription_id]
    );
    const subRow = subRes.rows[0] || {};

    const now = new Date();
    const baseDate = subRow.current_period_end ? new Date(subRow.current_period_end) : now;
    const start = baseDate > now ? baseDate : now;
    const monthsToAdd = (subRow.intervalo || '').toLowerCase() === 'annual' ? 12 : 1;
    const newEnd = addMonths(start, monthsToAdd);

    await client.query(
      `UPDATE subscriptions
       SET status = 'active', current_period_end = $1, next_billing_date = $1
       WHERE id = $2`,
      [newEnd.toISOString(), subRow.sub_id]
    );

    const updInv = await client.query(
      `UPDATE invoices SET pagado = TRUE, pagado_en = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );

    await client.query('COMMIT');
    return res.json({ message: 'Pago confirmado', invoice: updInv.rows[0], subscription: { id: subRow.sub_id, current_period_end: newEnd.toISOString(), next_billing_date: newEnd.toISOString() } });
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};
