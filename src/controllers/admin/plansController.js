const db = require('../../db');

// Crear plan (superadmin)
exports.create = async (req, res) => {
  try {
    const { nombre, precio, intervalo, descripcion, features, activo } = req.body;
    const result = await db.query(
      `INSERT INTO plans (nombre, precio, intervalo, descripcion, features, activo)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, TRUE)) RETURNING *`,
      [nombre, precio || 0, intervalo || 'monthly', descripcion || null, features ? JSON.stringify(features) : null, activo]
    );
    res.status(201).json({ message: 'Plan creado', plan: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Listar planes
exports.list = async (req, res) => {
  try {
    const result = await db.query(`SELECT * FROM plans ORDER BY created_at DESC`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Obtener plan por id
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(`SELECT * FROM plans WHERE id=$1`, [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Plan no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Actualizar plan
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, precio, intervalo, descripcion, features, activo } = req.body;
    const result = await db.query(
      `UPDATE plans SET nombre=$1, precio=$2, intervalo=$3, descripcion=$4, features=$5, activo=$6 WHERE id=$7 RETURNING *`,
      [nombre, precio, intervalo, descripcion, features ? JSON.stringify(features) : null, activo, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Plan no encontrado' });
    res.json({ message: 'Plan actualizado', plan: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Eliminar plan
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(`DELETE FROM plans WHERE id=$1 RETURNING *`, [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Plan no encontrado' });
    res.json({ message: 'Plan eliminado', plan: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
