const db = require('../db');

// Crear empleado
exports.create = async (req, res) => {
  try {
    const usuario = req.usuario;
    const {
      nombre,
      apellido,
      documento,
      fecha_nacimiento,
      telefono,
      email,
      direccion,
      localidad,
      sexo,
      legajo,
      banco,
      cbu,
      alias,
      fecha_inicio,
      fecha_fin,
      motivo_baja,
    } = req.body || {};

    if (!nombre || !nombre.toString().trim()) {
      return res.status(400).json({ message: 'El nombre es obligatorio' });
    }

    const result = await db.query(
      `INSERT INTO empleados (
         negocio_id, nombre, apellido, documento, fecha_nacimiento, telefono, email, direccion, localidad, sexo,
         legajo, banco, cbu, alias, fecha_inicio, fecha_fin, motivo_baja, activo
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
         $11,$12,$13,$14,$15,$16,$17,TRUE
       ) RETURNING *`,
      [
        usuario.negocio_id,
        nombre || null,
        apellido || null,
        documento || null,
        fecha_nacimiento || null,
        telefono || null,
        email || null,
        direccion || null,
        localidad || null,
        sexo || null,
        legajo || null,
        banco || null,
        cbu || null,
        alias || null,
        fecha_inicio || null,
        fecha_fin || null,
        motivo_baja || null,
      ]
    );

    res.status(201).json({ message: 'Empleado creado', empleado: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Ya existe un empleado con ese documento en este negocio' });
    }
    res.status(500).json({ error: err.message });
  }
};

// Listar empleados del negocio (por defecto solo activos)
exports.getAll = async (req, res) => {
  try {
    const usuario = req.usuario;
    const estado = (req.query.estado || '').toLowerCase();
    const onlyActive = estado !== 'todos';
    const result = await db.query(
      `SELECT * FROM empleados
       WHERE negocio_id=$1 ${onlyActive ? 'AND activo=TRUE' : ''}
       ORDER BY nombre ASC, apellido ASC`,
      [usuario.negocio_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Obtener por ID
exports.getById = async (req, res) => {
  try {
    const usuario = req.usuario;
    const { id } = req.params;
    const result = await db.query(
      `SELECT * FROM empleados WHERE id=$1 AND negocio_id=$2`,
      [id, usuario.negocio_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Empleado no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Actualizar empleado
exports.update = async (req, res) => {
  try {
    const usuario = req.usuario;
    const { id } = req.params;
    const {
      nombre,
      apellido,
      documento,
      fecha_nacimiento,
      telefono,
      email,
      direccion,
      localidad,
      sexo,
      legajo,
      banco,
      cbu,
      alias,
      fecha_inicio,
      fecha_fin,
      motivo_baja,
      activo,
    } = req.body || {};

    if (!nombre || !nombre.toString().trim()) {
      return res.status(400).json({ message: 'El nombre es obligatorio' });
    }

    const setActivo = activo === undefined ? true : !!activo;
    const fechaFinApplied = setActivo ? (fecha_fin || null) : (fecha_fin || new Date().toISOString().slice(0, 10));

    const result = await db.query(
      `UPDATE empleados SET
         nombre=$1, apellido=$2, documento=$3, fecha_nacimiento=$4, telefono=$5, email=$6,
         direccion=$7, localidad=$8, sexo=$9, legajo=$10, banco=$11, cbu=$12, alias=$13,
         fecha_inicio=$14, fecha_fin=$15, motivo_baja=$16, activo=$17
       WHERE id=$18 AND negocio_id=$19
       RETURNING *`,
      [
        nombre || null,
        apellido || null,
        documento || null,
        fecha_nacimiento || null,
        telefono || null,
        email || null,
        direccion || null,
        localidad || null,
        sexo || null,
        legajo || null,
        banco || null,
        cbu || null,
        alias || null,
        fecha_inicio || null,
        fechaFinApplied,
        motivo_baja || null,
        setActivo,
        id,
        usuario.negocio_id,
      ]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: 'Empleado no encontrado' });

    res.json({ message: 'Empleado actualizado', empleado: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Ya existe un empleado con ese documento en este negocio' });
    }
    res.status(500).json({ error: err.message });
  }
};

// Dar de baja (soft delete)
exports.remove = async (req, res) => {
  try {
    const usuario = req.usuario;
    const { id } = req.params;
    const { motivo_baja, fecha_fin } = req.body || {};
    const current = await db.query(
      `SELECT id, activo FROM empleados WHERE id=$1 AND negocio_id=$2`,
      [id, usuario.negocio_id]
    );
    if (current.rows.length === 0) return res.status(404).json({ message: 'Empleado no encontrado' });

    const isActive = current.rows[0].activo !== false;

    if (!isActive) {
      const deleted = await db.query(
        `DELETE FROM empleados WHERE id=$1 AND negocio_id=$2 RETURNING *`,
        [id, usuario.negocio_id]
      );
      return res.json({ message: 'Empleado eliminado definitivamente', empleado: deleted.rows[0] });
    }

    const result = await db.query(
      `UPDATE empleados SET activo=FALSE, fecha_fin=COALESCE($1, fecha_fin, CURRENT_DATE), motivo_baja=COALESCE($2, motivo_baja)
       WHERE id=$3 AND negocio_id=$4
       RETURNING *`,
      [
        fecha_fin || null,
        motivo_baja || 'Baja manual',
        id,
        usuario.negocio_id,
      ]
    );

    res.json({ message: 'Empleado dado de baja', empleado: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
