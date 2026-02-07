const db = require('../db');

// Crear proveedor (catálogo global) y vincular al negocio
exports.create = async (req, res) => {
  try {
    const usuario = req.usuario;
    const { nombre, cuit, email, telefono, direccion, notas, alias } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ message: 'El nombre es obligatorio' });
    }

    let proveedor;

    if (cuit) {
      const exists = await db.query(`SELECT * FROM proveedores WHERE cuit=$1`, [cuit]);
      if (exists.rows.length > 0) {
        proveedor = exists.rows[0];
      }
    }

    if (!proveedor) {
      const created = await db.query(
        `INSERT INTO proveedores (nombre, cuit, email, telefono, direccion, notas)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [nombre.trim(), cuit || null, email || null, telefono || null, direccion || null, notas || null]
      );
      proveedor = created.rows[0];
    }

    // vincular al negocio
    const link = await db.query(
      `INSERT INTO negocio_proveedor (negocio_id, proveedor_id, alias)
       VALUES ($1, $2, $3)
       ON CONFLICT (negocio_id, proveedor_id) DO UPDATE SET alias = COALESCE(EXCLUDED.alias, negocio_proveedor.alias)
       RETURNING *`,
      [usuario.negocio_id, proveedor.id, alias || null]
    );

    res.status(201).json({ ...proveedor, estado: link.rows[0].estado, alias: link.rows[0].alias });
  } catch (err) {
    if (err.message && err.message.includes('unique') && err.message.includes('cuit')) {
      return res.status(409).json({ message: 'Ya existe un proveedor con ese CUIT/CUIL' });
    }
    res.status(500).json({ error: err.message });
  }
};

// Listar proveedores del negocio
exports.getAll = async (req, res) => {
  try {
    const usuario = req.usuario;
    const { estado } = req.query; // opcional true/false
    const params = [usuario.negocio_id];
    let query = `SELECT p.*, np.estado, np.alias
                 FROM proveedores p
                 INNER JOIN negocio_proveedor np ON np.proveedor_id = p.id AND np.negocio_id = $1`;
    if (estado !== undefined) {
      params.push(estado === 'true');
      query += ` AND np.estado=$${params.length}`;
    }
    query += ' ORDER BY p.nombre ASC';
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Obtener proveedor
exports.getOne = async (req, res) => {
  try {
    const usuario = req.usuario;
    const { id } = req.params;
    const result = await db.query(
      `SELECT p.*, np.estado, np.alias
       FROM proveedores p
       INNER JOIN negocio_proveedor np ON np.proveedor_id = p.id AND np.negocio_id = $2
       WHERE p.id=$1`,
      [id, usuario.negocio_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Proveedor no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Actualizar proveedor
exports.update = async (req, res) => {
  try {
    const usuario = req.usuario;
    const { id } = req.params;
    const { nombre, cuit, email, telefono, direccion, notas, estado, alias } = req.body;

    const current = await db.query(
      `SELECT p.*, np.estado AS link_estado, np.alias
       FROM proveedores p
       INNER JOIN negocio_proveedor np ON np.proveedor_id = p.id AND np.negocio_id = $2
       WHERE p.id=$1`,
      [id, usuario.negocio_id]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ message: 'Proveedor no encontrado' });
    }

    // CUIT/CUIL no es editable: si envían uno distinto, rechazar
    if (cuit && cuit !== current.rows[0].cuit) {
      return res.status(400).json({ message: 'El CUIT/CUIL no se puede modificar. Crea un nuevo proveedor.' });
    }

    const provRes = await db.query(
      `UPDATE proveedores
       SET nombre=COALESCE($1, nombre),
           email=$2,
           telefono=$3,
           direccion=$4,
           notas=$5
       WHERE id=$6
       RETURNING *`,
      [nombre ? nombre.trim() : null, email || null, telefono || null, direccion || null, notas || null, id]
    );

    const linkRes = await db.query(
      `UPDATE negocio_proveedor
       SET alias = COALESCE($1, alias),
           estado = COALESCE($2, estado)
       WHERE proveedor_id=$3 AND negocio_id=$4
       RETURNING *`,
      [alias || null, estado, id, usuario.negocio_id]
    );

    res.json({ ...provRes.rows[0], estado: linkRes.rows[0].estado, alias: linkRes.rows[0].alias });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Activar / desactivar (toggle estado)
exports.toggleEstado = async (req, res) => {
  try {
    const usuario = req.usuario;
    const { id } = req.params;

    const result = await db.query(
      `UPDATE negocio_proveedor
       SET estado = NOT estado
       WHERE proveedor_id=$1 AND negocio_id=$2
       RETURNING *`,
      [id, usuario.negocio_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Proveedor no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
