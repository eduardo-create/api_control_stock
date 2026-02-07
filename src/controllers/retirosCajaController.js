const db = require('../db');

// Registrar un retiro de caja
exports.create = async (req, res) => {
  try {
    const { turno_id, monto, motivo } = req.body;
    const usuario = req.usuario;

    // Validar que el turno exista y esté abierto
    const turnoResult = await db.query(
      `SELECT id, negocio_id, local_id, estado, saldo_inicial, saldo_final
       FROM turnos WHERE id=$1`,
      [turno_id]
    );

    if (turnoResult.rows.length === 0) {
      return res.status(404).json({ message: "Turno no encontrado" });
    }

    const turno = turnoResult.rows[0];
    if (turno.estado !== 'abierto') {
      return res.status(400).json({ message: "El turno debe estar abierto para registrar retiros" });
    }

    // Validar que el retiro no deje la caja en negativo
    const saldoActual = turno.saldo_final ?? turno.saldo_inicial;
    if (saldoActual - monto < 0) {
      return res.status(400).json({ message: "El retiro no puede dejar la caja en negativo" });
    }

    // Registrar el retiro
    const result = await db.query(
      `INSERT INTO retiros_caja (turno_id, usuario_id, negocio_id, local_id, monto, motivo)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [turno_id, usuario.id, usuario.negocio_id, usuario.local_id, monto, motivo]
    );

    // Actualizar saldo del turno
    await db.query(
      `UPDATE turnos SET saldo_final = $1 WHERE id=$2`,
      [saldoActual - monto, turno_id]
    );

    res.status(201).json({ message: "Retiro registrado correctamente", retiro: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Listar retiros de un turno
exports.getByTurno = async (req, res) => {
  try {
    const { turno_id } = req.params;
    const usuario = req.usuario;

    const result = await db.query(
      `SELECT r.id, r.monto, r.motivo, r.fecha, u.nombre AS usuario
       FROM retiros_caja r
       JOIN usuarios u ON r.usuario_id = u.id
       WHERE r.turno_id = $1 AND r.negocio_id = $2
       ORDER BY r.fecha ASC`,
      [turno_id, usuario.negocio_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No se encontraron retiros para este turno" });
    }

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};