const db = require('../db');

// Abrir turno
exports.abrirTurno = async (req, res) => {
  try {
    const { saldo_inicial, local_id, descripcion } = req.body;
    const usuario = req.usuario;

    if (!descripcion || !descripcion.toString().trim()) {
      return res.status(400).json({ message: 'La descripción del turno es obligatoria' });
    }
    if (!local_id) {
      return res.status(400).json({ message: 'Debes indicar el local del turno' });
    }

    // Validar que no haya un turno abierto en ese local
    const abierto = await db.query(
      `SELECT id FROM turnos WHERE local_id=$1 AND estado='abierto'`,
      [local_id]
    );
    if (abierto.rows.length > 0) {
      return res.status(400).json({ message: "Ya existe un turno abierto en este local" });
    }

    const result = await db.query(
      `INSERT INTO turnos (negocio_id, local_id, usuario_id, saldo_inicial, descripcion, estado, fecha_apertura)
       VALUES ($1, $2, $3, $4, $5, 'abierto', CURRENT_TIMESTAMP)
       RETURNING *`,
      [usuario.negocio_id, local_id, usuario.id, saldo_inicial, descripcion]
    );

    res.status(201).json({ message: "Turno abierto correctamente", turno: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Cerrar turno
exports.cerrarTurno = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;

    // Validar que el turno exista y esté abierto
    const turno = await db.query(
      `SELECT * FROM turnos WHERE id=$1 AND estado='abierto' AND negocio_id=$2`,
      [id, usuario.negocio_id]
    );

    if (turno.rows.length === 0) {
      return res.status(404).json({ message: "Turno no encontrado o ya cerrado" });
    }

    const turnoData = turno.rows[0];

    // No permitir cerrar el turno si existe una caja abierta en el mismo local
    const cajaAbierta = await db.query(
      `SELECT id FROM caja_turno WHERE local_id=$1 AND estado='abierta' LIMIT 1`,
      [turnoData.local_id]
    );
    if (cajaAbierta.rows.length > 0) {
      return res.status(400).json({ message: "No puedes cerrar el turno mientras haya una caja abierta. Cierra la caja primero." });
    }

    // Calcular saldo final: saldo inicial + ventas - retiros
    const ventas = await db.query(
      `SELECT COALESCE(SUM(total),0) AS total_ventas
       FROM ventas WHERE turno_id=$1`,
      [id]
    );

    const retiros = await db.query(
      `SELECT COALESCE(SUM(monto),0) AS total_retiros
       FROM retiros_caja WHERE turno_id=$1`,
      [id]
    );

    const saldoFinal = parseFloat(turnoData.saldo_inicial) 
                     + parseFloat(ventas.rows[0].total_ventas) 
                     - parseFloat(retiros.rows[0].total_retiros);

    const result = await db.query(
      `UPDATE turnos
       SET estado='cerrado',
           fecha_cierre=CURRENT_TIMESTAMP,
           saldo_final=$1
       WHERE id=$2 AND estado='abierto'
       RETURNING *`,
      [saldoFinal, id]
    );

    res.json({ message: "Turno cerrado correctamente", turno: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Consultar turno actual
exports.getTurnoActual = async (req, res) => {
  try {
    const usuario = req.usuario;

    const localId = usuario.local_id || req.query.local_id || req.body.local_id;
    if (!localId) {
      return res.status(400).json({ message: 'No se indicó local para consultar turno' });
    }

    const result = await db.query(
      `SELECT * FROM turnos
       WHERE local_id=$1 AND estado='abierto'
       ORDER BY fecha_apertura DESC LIMIT 1`,
      [localId]
    );

    if (result.rows.length === 0) {
      return res.json({ turno: null, message: "No hay turno abierto en este local" });
    }

    res.json({ turno: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Listar turnos históricos (opcional)
exports.getTurnos = async (req, res) => {
  try {
    const usuario = req.usuario;
    const { desde, hasta } = req.query;

    let query = `SELECT * FROM turnos WHERE negocio_id=$1`;
    let params = [usuario.negocio_id];

    if (desde && hasta) {
      query += ` AND fecha_apertura BETWEEN $2 AND $3`;
      params.push(`${desde} 00:00:00`, `${hasta} 23:59:59`);
    }

    query += ` ORDER BY fecha_apertura DESC`;

    const result = await db.query(query, params);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};