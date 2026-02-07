const db = require('../db');

// Apertura de caja
exports.apertura = async (req, res) => {
  try {
    const { local_id, usuario_id, monto_inicial } = req.body;

    // Validaciones básicas
    if (!local_id || !usuario_id || monto_inicial === undefined || monto_inicial === null) {
      return res.status(400).json({ message: "local_id, usuario_id y monto_inicial son obligatorios" });
    }

    // Validar que el local exista
    const local = await db.query(`SELECT id FROM locales WHERE id = $1`, [local_id]);
    if (local.rows.length === 0) {
      return res.status(404).json({ message: "Local no encontrado" });
    }

    // Validar que el usuario exista
    const usuario = await db.query(`SELECT id FROM usuarios WHERE id = $1`, [usuario_id]);
    if (usuario.rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Validar que no haya un turno abierto en ese local
    const turnoAbierto = await db.query(`
      SELECT id FROM caja_turno 
      WHERE local_id = $1 AND estado = 'abierta'
    `, [local_id]);

    if (turnoAbierto.rows.length > 0) {
      return res.status(400).json({ message: "Ya existe un turno abierto en este local" });
    }

    // Insertar apertura
    const result = await db.query(`
      INSERT INTO caja_turno (local_id, usuario_id, fecha, hora_apertura, monto_inicial, estado)
      VALUES ($1, $2, CURRENT_DATE, CURRENT_TIMESTAMP, $3, 'abierta')
      RETURNING *;
    `, [local_id, usuario_id, monto_inicial]);
    
    //traer datos del local    
    const localInfo = await db.query(`SELECT nombre, direccion FROM locales WHERE id = $1`, [local_id]);


    res.status(201).json({
      message: "Turno de caja abierto correctamente",
      turno: result.rows[0],
      local: localInfo.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// Cierre de turno de caja
exports.cierre = async (req, res) => {
  try {
    const { turno_id } = req.params;
    const { monto_final } = req.body;

    // Buscar turno
    const turno = await db.query(`SELECT * FROM caja_turno WHERE id = $1`, [turno_id]);
    if (turno.rows.length === 0) {
      return res.status(404).json({ message: "Turno no encontrado" });
    }

    if (turno.rows[0].estado === 'cerrada') {
      return res.status(400).json({ message: "El turno ya está cerrado" });
    }

    // Calcular ventas y gastos del turno
    const movimientos = await db.query(`
      SELECT tipo, COALESCE(SUM(monto), 0) AS total
      FROM movimientos_caja
      WHERE turno_id = $1
      GROUP BY tipo
    `, [turno_id]);

    // Totales por tipo para calcular el teórico
    const totals = { VENTA: 0, INGRESO: 0, GASTO: 0, EGRESO: 0, SUELDO: 0, AJUSTE: 0 };
    movimientos.rows.forEach(mov => {
      const key = mov.tipo || 'OTRO';
      const val = parseFloat(mov.total) || 0;
      if (totals[key] === undefined) totals[key] = 0;
      totals[key] += val;
    });

    const inicial = parseFloat(turno.rows[0].monto_inicial) || 0;
    const esperado = inicial + totals.VENTA + totals.INGRESO - totals.GASTO - totals.EGRESO - totals.SUELDO + totals.AJUSTE;
    const montoFinalAplicado = (monto_final === undefined || monto_final === null || monto_final === '')
      ? esperado
      : parseFloat(monto_final);
    const diferencia = montoFinalAplicado - esperado;

    // Actualizar turno
    const result = await db.query(`
      UPDATE caja_turno
      SET hora_cierre = CURRENT_TIMESTAMP,
              monto_final = $1,
          estado = 'cerrada'
      WHERE id = $2
      RETURNING *;
            `, [montoFinalAplicado, turno_id]);

    res.json({
      message: "Turno cerrado correctamente",
      turno: result.rows[0],
      resumen: {
        monto_inicial: turno.rows[0].monto_inicial,
        ventas: totals.VENTA,
        ingresos: totals.INGRESO,
        gastos: totals.GASTO,
        egresos: totals.EGRESO,
        sueldos: totals.SUELDO,
        ajustes: totals.AJUSTE,
        esperado,
        monto_final: montoFinalAplicado,
        diferencia
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// Resumen diario de caja
exports.resumenDiario = async (req, res) => {
  try {
    const { local_id } = req.params;
    const { fecha } = req.query;

    if (!fecha) {
      return res.status(400).json({ message: "Debes indicar la fecha en formato YYYY-MM-DD" });
    }

    // Obtener turnos del día
    const turnos = await db.query(`
      SELECT ct.id AS turno_id, u.nombre AS usuario, ct.monto_inicial, ct.monto_final, ct.estado
      FROM caja_turno ct
      JOIN usuarios u ON ct.usuario_id = u.id
      WHERE ct.local_id = $1 AND ct.fecha = $2
      ORDER BY ct.hora_apertura ASC
    `, [local_id, fecha]);

    if (turnos.rows.length === 0) {
      return res.status(404).json({ message: "No se encontraron turnos para esa fecha" });
    }

    let resumenTurnos = [];
    let totalVentas = 0;
    let totalGastos = 0;
    let totalDiferencia = 0;

    for (const turno of turnos.rows) {
      // Movimientos por turno
      const movimientos = await db.query(`
        SELECT tipo, SUM(monto) AS total
        FROM movimientos_caja
        WHERE turno_id = $1
        GROUP BY tipo
      `, [turno.turno_id]);

      let ventas = 0;
      let gastos = 0;

      movimientos.rows.forEach(mov => {
        if (mov.tipo === 'VENTA') ventas = parseFloat(mov.total);
        if (mov.tipo === 'GASTO') gastos = parseFloat(mov.total);
        if (mov.tipo === 'AJUSTE') gastos += parseFloat(mov.total);
      });

      const esperado = parseFloat(turno.monto_inicial) + ventas - gastos;
      const diferencia = turno.monto_final ? parseFloat(turno.monto_final) - esperado : null;

      resumenTurnos.push({
        turno_id: turno.turno_id,
        usuario: turno.usuario,
        monto_inicial: turno.monto_inicial,
        monto_final: turno.monto_final,
        ventas,
        gastos,
        diferencia
      });

      totalVentas += ventas;
      totalGastos += gastos;
      totalDiferencia += diferencia || 0;
    }

    // Stock final del local
    const stockFinal = await db.query(`
      SELECT i.nombre AS insumo, sl.cantidad
      FROM stock_local sl
      JOIN insumos i ON sl.insumo_id = i.id
      WHERE sl.local_id = $1
    `, [local_id]);

    res.json({
      local_id,
      fecha,
      turnos: resumenTurnos,
      total_dia: {
        ventas: totalVentas,
        gastos: totalGastos,
        diferencia: totalDiferencia,
        stock_final: stockFinal.rows
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// Listar turnos de un día con sus movimientos
exports.listarTurnos = async (req, res) => {
  try {
    const { local_id } = req.params;
    const { fecha } = req.query;

    if (!fecha) {
      return res.status(400).json({ message: "Debes indicar la fecha en formato YYYY-MM-DD" });
    }

    // Obtener turnos del día
    const turnos = await db.query(`
      SELECT ct.id AS turno_id, u.nombre AS usuario, ct.monto_inicial, ct.monto_final, ct.estado, ct.hora_apertura, ct.hora_cierre
      FROM caja_turno ct
      JOIN usuarios u ON ct.usuario_id = u.id
      WHERE ct.local_id = $1 AND ct.fecha = $2
      ORDER BY ct.hora_apertura ASC
    `, [local_id, fecha]);

    if (turnos.rows.length === 0) {
      return res.status(404).json({ message: "No se encontraron turnos para esa fecha" });
    }

    let detalleTurnos = [];

    for (const turno of turnos.rows) {
      // Movimientos del turno
      const movimientos = await db.query(`
        SELECT id, tipo, descripcion, monto, fecha
        FROM movimientos_caja
        WHERE turno_id = $1
        ORDER BY fecha ASC
      `, [turno.turno_id]);

      detalleTurnos.push({
        turno_id: turno.turno_id,
        usuario: turno.usuario,
        monto_inicial: turno.monto_inicial,
        monto_final: turno.monto_final,
        estado: turno.estado,
        hora_apertura: turno.hora_apertura,
        hora_cierre: turno.hora_cierre,
        movimientos: movimientos.rows
      });
    }

    res.json({
      local_id,
      fecha,
      turnos: detalleTurnos
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// Listar movimientos de un turno específico
exports.listarMovimientosTurno = async (req, res) => {
  try {
    const { turno_id } = req.params;

    // Validar que el turno exista
    const turno = await db.query(`
      SELECT ct.id, ct.local_id, u.nombre AS usuario, ct.monto_inicial, ct.monto_final, ct.estado, ct.hora_apertura, ct.hora_cierre
      FROM caja_turno ct
      JOIN usuarios u ON ct.usuario_id = u.id
      WHERE ct.id = $1
    `, [turno_id]);

    if (turno.rows.length === 0) {
      return res.status(404).json({ message: "Turno no encontrado" });
    }

    // Movimientos del turno
    const movimientos = await db.query(`
      SELECT id, tipo, descripcion, monto, fecha, usuario_id
      FROM movimientos_caja
      WHERE turno_id = $1
      ORDER BY fecha ASC
    `, [turno_id]);

    res.json({
      turno: turno.rows[0],
      movimientos: movimientos.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Arqueo intermedio de caja
exports.arqueoIntermedio = async (req, res) => {
  try {
    const { turno_id } = req.params;
    const { monto_contado } = req.body;

    if (!monto_contado) {
      return res.status(400).json({ message: "Debes indicar el monto_contado actual" });
    }

    // Buscar turno
    const turno = await db.query(`SELECT * FROM caja_turno WHERE id = $1`, [turno_id]);
    if (turno.rows.length === 0) {
      return res.status(404).json({ message: "Turno no encontrado" });
    }

    if (turno.rows[0].estado !== 'abierta') {
      return res.status(400).json({ message: "El arqueo solo puede hacerse en turnos abiertos" });
    }

    // Calcular movimientos hasta ahora
    const movimientos = await db.query(`
      SELECT tipo, SUM(monto) AS total
      FROM movimientos_caja
      WHERE turno_id = $1
      GROUP BY tipo
    `, [turno_id]);

    let ventas = 0;
    let gastos = 0;

    movimientos.rows.forEach(mov => {
      if (mov.tipo === 'VENTA') ventas = parseFloat(mov.total);
      if (mov.tipo === 'GASTO') gastos = parseFloat(mov.total);
      if (mov.tipo === 'AJUSTE') gastos += parseFloat(mov.total);
    });

    const esperado = parseFloat(turno.rows[0].monto_inicial) + ventas - gastos;
    const diferencia = parseFloat(monto_contado) - esperado;

    res.json({
      message: "Arqueo intermedio realizado",
      turno_id,
      resumen: {
        monto_inicial: turno.rows[0].monto_inicial,
        ventas,
        gastos,
        esperado,
        monto_contado,
        diferencia
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Retiro parcial de caja (alivio) durante un turno abierto
exports.retiroParcial = async (req, res) => {
  try {
    const { turno_id, monto, motivo } = req.body;
    const usuarioId = req.usuario?.id;

    if (!turno_id || monto === undefined || monto === null) {
      return res.status(400).json({ message: "turno_id y monto son obligatorios" });
    }
    const montoNum = Number(monto);
    if (Number.isNaN(montoNum) || montoNum <= 0) {
      return res.status(400).json({ message: "El monto debe ser mayor a 0" });
    }

    const turno = await db.query(`SELECT id, estado, monto_inicial FROM caja_turno WHERE id = $1`, [turno_id]);
    if (turno.rows.length === 0) {
      return res.status(404).json({ message: "Turno de caja no encontrado" });
    }
    if (turno.rows[0].estado !== 'abierta') {
      return res.status(400).json({ message: "La caja debe estar abierta para registrar un retiro" });
    }

    const desc = motivo ? `Retiro: ${motivo}` : 'Retiro de caja';
    const insert = await db.query(`
      INSERT INTO movimientos_caja (turno_id, tipo, descripcion, monto, usuario_id)
      VALUES ($1, 'EGRESO', $2, $3, $4)
      RETURNING *
    `, [turno_id, desc, montoNum, usuarioId || null]);

    res.status(201).json({ message: "Retiro registrado", movimiento: insert.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Registrar gasto manual en un turno abierto
exports.registrarGasto = async (req, res) => {
  try {
    const { turno_id, monto, descripcion } = req.body;
    const usuarioId = req.usuario?.id;

    if (!turno_id || monto === undefined || monto === null) {
      return res.status(400).json({ message: "turno_id y monto son obligatorios" });
    }
    const montoNum = Number(monto);
    if (Number.isNaN(montoNum) || montoNum <= 0) {
      return res.status(400).json({ message: "El monto debe ser mayor a 0" });
    }

    const turno = await db.query(`SELECT id, estado FROM caja_turno WHERE id = $1`, [turno_id]);
    if (turno.rows.length === 0) {
      return res.status(404).json({ message: "Turno de caja no encontrado" });
    }
    if (turno.rows[0].estado !== 'abierta') {
      return res.status(400).json({ message: "La caja debe estar abierta para registrar un gasto" });
    }

    const desc = descripcion && descripcion.trim() ? descripcion.trim() : 'Gasto manual';
    const insert = await db.query(
      `INSERT INTO movimientos_caja (turno_id, tipo, descripcion, monto, usuario_id)
       VALUES ($1, 'GASTO', $2, $3, $4)
       RETURNING *` ,
      [turno_id, desc, montoNum, usuarioId || null]
    );

    res.status(201).json({ message: 'Gasto registrado', movimiento: insert.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};