const db = require('../../db');

// Listar suscripciones
exports.list = async (req, res) => {
  try {
    const result = await db.query(`SELECT s.*, p.nombre AS plan_nombre FROM subscriptions s LEFT JOIN plans p ON s.plan_id = p.id ORDER BY s.created_at DESC`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Obtener suscripción por id
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(`SELECT s.*, p.nombre AS plan_nombre FROM subscriptions s LEFT JOIN plans p ON s.plan_id = p.id WHERE s.id=$1`, [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Suscripción no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Crear suscripción manual (superadmin)
exports.create = async (req, res) => {
  try {
    const { negocio_id, plan_id, status, trial_end, current_period_end, next_billing_date, meta } = req.body;
    const result = await db.query(
      `INSERT INTO subscriptions (negocio_id, plan_id, status, trial_end, current_period_end, next_billing_date, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [negocio_id, plan_id, status || 'active', trial_end || null, current_period_end || null, next_billing_date || null, meta ? JSON.stringify(meta) : null]
    );
    res.status(201).json({ message: 'Suscripción creada', subscription: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Actualizar estado de suscripción
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, next_billing_date, current_period_end, meta } = req.body;
    const result = await db.query(
      `UPDATE subscriptions SET status=$1, next_billing_date=$2, current_period_end=$3, meta=$4 WHERE id=$5 RETURNING *`,
      [status, next_billing_date || null, current_period_end || null, meta ? JSON.stringify(meta) : null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Suscripción no encontrada' });
    res.json({ message: 'Suscripción actualizada', subscription: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
