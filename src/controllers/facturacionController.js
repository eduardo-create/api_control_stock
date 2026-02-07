const db = require('../db');

// Crear comprobante (esqueleto) asociado a una venta
exports.createComprobante = async (req, res) => {
  try {
    const { venta_id, tipo_comprobante, proveedor } = req.body;
    const usuario = req.usuario;

    // Validaciones básicas
    if (!venta_id || !tipo_comprobante) {
      return res.status(400).json({ message: 'venta_id y tipo_comprobante son obligatorios' });
    }

    // Aquí se integraría la lógica con AFIP o proveedor de facturación
    // Por ahora guardamos un comprobante local en la tabla comprobantes
    const result = await db.query(
      `INSERT INTO comprobantes (venta_id, tipo_comprobante, numero, cae, fecha_emision, monto, negocio_id, meta)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5, $6, $7) RETURNING *`,
      [venta_id, tipo_comprobante, null, null, 0, usuario.negocio_id, JSON.stringify({ proveedor })]
    );

    res.status(201).json({ message: 'Comprobante creado (esqueleto)', comprobante: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Listar comprobantes del negocio
exports.list = async (req, res) => {
  try {
    const usuario = req.usuario;

    const result = await db.query(
      `SELECT id, venta_id, tipo_comprobante, numero, cae, fecha_emision, monto, meta
       FROM comprobantes
       WHERE negocio_id = $1
       ORDER BY fecha_emision DESC`,
      [usuario.negocio_id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Obtener comprobante por id
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;

    const result = await db.query(
      `SELECT id, venta_id, tipo_comprobante, numero, cae, fecha_emision, monto, meta
       FROM comprobantes
       WHERE id = $1 AND negocio_id = $2`,
      [id, usuario.negocio_id]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: 'Comprobante no encontrado' });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
