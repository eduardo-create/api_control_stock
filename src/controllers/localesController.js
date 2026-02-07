const db = require('../db');

// Crear local
exports.create = async (req, res) => {
  try {
    const { nombre, direccion } = req.body;
    const usuario = req.usuario;

    // Permitir solo un local por negocio
    const existing = await db.query(`SELECT id FROM locales WHERE negocio_id = $1 LIMIT 1`, [usuario.negocio_id]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'Ya existe un local para este negocio. Solo se permite uno.' });
    }

    // Solo admin/superadmin pueden crear locales
    const result = await db.query(
      `INSERT INTO locales (nombre, direccion, negocio_id)
       VALUES ($1, $2, $3) RETURNING *`,
      [nombre, direccion, usuario.negocio_id]
    );

    res.status(201).json({ message: "Local creado", local: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Listar locales de un negocio
exports.getAll = async (req, res) => {
  try {
    const usuario = req.usuario;

    const result = await db.query(
      `SELECT * FROM locales WHERE negocio_id=$1 ORDER BY nombre ASC`,
      [usuario.negocio_id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Obtener local por ID
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;

    const result = await db.query(
      `SELECT * FROM locales WHERE id=$1 AND negocio_id=$2`,
      [id, usuario.negocio_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Local no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Actualizar local
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, direccion } = req.body;
    const usuario = req.usuario;

    const result = await db.query(
      `UPDATE locales
       SET nombre=$1, direccion=$2
       WHERE id=$3 AND negocio_id=$4
       RETURNING *`,
      [nombre, direccion, id, usuario.negocio_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Local no encontrado o no pertenece a tu negocio" });
    }

    res.json({ message: "Local actualizado", local: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Eliminar local
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;

    const result = await db.query(
      `DELETE FROM locales WHERE id=$1 AND negocio_id=$2 RETURNING *`,
      [id, usuario.negocio_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Local no encontrado o no pertenece a tu negocio" });
    }

    res.json({ message: "Local eliminado", local: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};