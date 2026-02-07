const db = require('../db');

// Crear categoría
exports.createCategoria = async (req, res) => {
  try {
    const { nombre, orden } = req.body;
    const usuario = req.usuario;

    const result = await db.query(
      `INSERT INTO categorias (negocio_id, nombre, orden, estado)
       VALUES ($1, $2, $3, true)
       RETURNING *`,
      [usuario.negocio_id, nombre, orden || 0]
    );

    res.status(201).json({ message: "Categoría creada correctamente", categoria: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Listar categorías
exports.getCategorias = async (req, res) => {
  try {
    const usuario = req.usuario;

    const result = await db.query(
      `SELECT * FROM categorias WHERE negocio_id=$1 ORDER BY orden ASC`,
      [usuario.negocio_id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Editar categoría
exports.updateCategoria = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, orden, estado } = req.body;
    const usuario = req.usuario;

    const result = await db.query(
      `UPDATE categorias
       SET nombre=$1, orden=$2, estado=$3
       WHERE id=$4 AND negocio_id=$5
       RETURNING *`,
      [nombre, orden, estado, id, usuario.negocio_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Categoría no encontrada" });
    }

    res.json({ message: "Categoría actualizada correctamente", categoria: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Eliminar categoría
exports.deleteCategoria = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;

    const result = await db.query(
      `DELETE FROM categorias WHERE id=$1 AND negocio_id=$2 RETURNING *`,
      [id, usuario.negocio_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Categoría no encontrada" });
    }

    res.json({ message: "Categoría eliminada correctamente" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};