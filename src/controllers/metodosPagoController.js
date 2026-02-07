const db = require('../db');

// Crear método de pago (admin o superadmin)
exports.create = async (req, res) => {
  try {
    const { nombre } = req.body;
    const usuario = req.usuario;

    if (usuario.rol !== 'admin' && usuario.rol !== 'superadmin') {
      return res.status(403).json({ message: "No tienes permiso para crear métodos de pago" });
    }

    const result = await db.query(
      `INSERT INTO metodos_pago (nombre, negocio_id)
       VALUES ($1, $2) RETURNING *`,
      [nombre, usuario.negocio_id]
    );

    res.status(201).json({ message: "Método de pago creado correctamente", metodo: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Listar métodos de pago de un negocio
exports.getAll = async (req, res) => {
  try {
    const usuario = req.usuario;

    const result = await db.query(
      `SELECT id, nombre
       FROM metodos_pago
       WHERE negocio_id = $1
       ORDER BY id ASC`,
      [usuario.negocio_id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Obtener método de pago por ID
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;

    const result = await db.query(
      `SELECT id, nombre
       FROM metodos_pago
       WHERE id = $1 AND negocio_id = $2`,
      [id, usuario.negocio_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Método de pago no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Actualizar método de pago
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre } = req.body;
    const usuario = req.usuario;

    if (usuario.rol !== 'admin' && usuario.rol !== 'superadmin') {
      return res.status(403).json({ message: "No tienes permiso para actualizar métodos de pago" });
    }

    const result = await db.query(
      `UPDATE metodos_pago
       SET nombre=$1
       WHERE id=$2 AND negocio_id=$3
       RETURNING *`,
      [nombre, id, usuario.negocio_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Método de pago no encontrado o no pertenece a tu negocio" });
    }

    res.json({ message: "Método de pago actualizado correctamente", metodo: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Eliminar método de pago
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;

    if (usuario.rol !== 'admin' && usuario.rol !== 'superadmin') {
      return res.status(403).json({ message: "No tienes permiso para eliminar métodos de pago" });
    }

    const result = await db.query(
      `DELETE FROM metodos_pago
       WHERE id=$1 AND negocio_id=$2
       RETURNING *`,
      [id, usuario.negocio_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Método de pago no encontrado o no pertenece a tu negocio" });
    }

    res.json({ message: "Método de pago eliminado correctamente", metodo: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Alias para compatibilidad con rutas existentes
exports.crearMetodoPago = exports.create;