const db = require('../../db');

// Listar changelog (superadmin y admin)
exports.list = async (req, res) => {
  try {
    const { q, modulo, desde, hasta } = req.query;
    const filters = [];
    const values = [];

    if (q) {
      values.push(`%${q}%`);
      filters.push(`(titulo ILIKE $${values.length} OR contenido ILIKE $${values.length})`);
    }
    if (modulo) {
      values.push(modulo);
      filters.push(`modulo = $${values.length}`);
    }
    if (desde) {
      values.push(desde);
      filters.push(`visible_desde >= $${values.length}`);
    }
    if (hasta) {
      values.push(hasta);
      filters.push(`visible_desde <= $${values.length}`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const result = await db.query(
      `SELECT id, titulo, contenido, modulo, tags, visible_desde, created_by, created_at, image_base64
       FROM changelog
       ${whereClause}
       ORDER BY visible_desde DESC, id DESC` ,
      values
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Crear entrada (solo superadmin)
exports.create = async (req, res) => {
  try {
    const { titulo, contenido, modulo, tags, visible_desde, image_base64 } = req.body;
    const values = [titulo, contenido, modulo || null, tags || [], visible_desde || new Date(), req.usuario?.id || null, image_base64 || null];
    const result = await db.query(
      `INSERT INTO changelog (titulo, contenido, modulo, tags, visible_desde, created_by, image_base64)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      values
    );
    res.status(201).json({ message: 'Changelog creado', entry: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Actualizar entrada (solo superadmin)
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, contenido, modulo, tags, visible_desde, image_base64 } = req.body;
    const result = await db.query(
      `UPDATE changelog
       SET titulo = COALESCE($1, titulo),
           contenido = COALESCE($2, contenido),
           modulo = $3,
           tags = COALESCE($4, tags),
           visible_desde = COALESCE($5, visible_desde),
           image_base64 = COALESCE($6, image_base64)
       WHERE id = $7
       RETURNING *`,
      [titulo, contenido, modulo || null, tags || null, visible_desde || null, image_base64 || null, id]
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Entrada no encontrada' });
    res.json({ message: 'Changelog actualizado', entry: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Eliminar entrada (solo superadmin)
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM changelog WHERE id = $1 RETURNING *', [id]);
    if (!result.rowCount) return res.status(404).json({ message: 'Entrada no encontrada' });
    res.json({ message: 'Changelog eliminado', entry: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
