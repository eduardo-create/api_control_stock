const db = require('../db');

// Crear cliente
exports.create = async (req, res) => {
  try {
    const { nombre, email, telefono, dni, direccion, local_id } = req.body;
    const usuario = req.usuario;

    const result = await db.query(
      `INSERT INTO clientes (nombre, email, telefono, dni, direccion, negocio_id, local_id, activo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE) RETURNING *`,
      [nombre, email, telefono, dni, direccion, usuario.negocio_id, local_id]
    );

    res.status(201).json({ message: 'Cliente creado', cliente: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Listar clientes del negocio
exports.getAll = async (req, res) => {
  try {
    const usuario = req.usuario;
    const result = await db.query(
      `SELECT id, nombre, email, telefono, dni, direccion, local_id, activo, created_at
       FROM clientes
       WHERE negocio_id=$1
       ORDER BY nombre ASC`,
      [usuario.negocio_id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Obtener cliente por ID
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;
    const result = await db.query(
      `SELECT id, nombre, email, telefono, dni, direccion, local_id, activo, created_at
       FROM clientes
       WHERE id=$1 AND negocio_id=$2`,
      [id, usuario.negocio_id]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: 'Cliente no encontrado' });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Actualizar cliente
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, email, telefono, dni, direccion, local_id, activo } = req.body;
    const usuario = req.usuario;

    const result = await db.query(
      `UPDATE clientes
       SET nombre=$1, email=$2, telefono=$3, dni=$4, direccion=$5, local_id=$6, activo=$7
       WHERE id=$8 AND negocio_id=$9
       RETURNING *`,
      [nombre, email, telefono, dni, direccion, local_id, activo, id, usuario.negocio_id]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: 'Cliente no encontrado o no pertenece a tu negocio' });

    res.json({ message: 'Cliente actualizado', cliente: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Eliminar cliente
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;

    const result = await db.query(
      `DELETE FROM clientes WHERE id=$1 AND negocio_id=$2 RETURNING *`,
      [id, usuario.negocio_id]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: 'Cliente no encontrado o no pertenece a tu negocio' });

    res.json({ message: 'Cliente eliminado', cliente: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
