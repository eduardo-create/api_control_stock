const db = require('../db');

// Listar insumos disponibles (básico para módulo de compras)
exports.getAll = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, nombre, unidad, stock_total
       FROM insumos
       ORDER BY nombre ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
