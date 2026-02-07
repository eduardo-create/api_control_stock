const db = require('../db');

// Registrar un pago para una venta existente
exports.registrarPago = async (req, res) => {
  try {
    const { venta_id, metodo_id, monto } = req.body;

    if (!venta_id || !metodo_id || !monto) {
      return res.status(400).json({ message: "venta_id, metodo_id y monto son obligatorios" });
    }

    // Validar que la venta exista
    const ventaResult = await db.query(`SELECT id, total FROM ventas WHERE id = $1`, [venta_id]);
    if (ventaResult.rows.length === 0) {
      return res.status(404).json({ message: "Venta no encontrada" });
    }

    // Insertar el pago
    const result = await db.query(
      `INSERT INTO pagos_venta (venta_id, metodo_id, monto) VALUES ($1, $2, $3) RETURNING *`,
      [venta_id, metodo_id, monto]
    );

    res.json({
      message: "Pago registrado correctamente",
      pago: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Obtener todos los pagos de una venta específica
exports.getByVentaId = async (req, res) => {
  try {
    const { venta_id } = req.params;

    // Validar que la venta exista
    const ventaResult = await db.query(`SELECT id FROM ventas WHERE id = $1`, [venta_id]);
    if (ventaResult.rows.length === 0) {
      return res.status(404).json({ message: "Venta no encontrada" });
    }

    // Obtener pagos asociados
    const pagosResult = await db.query(`
      SELECT pv.id, pv.monto, pv.metodo_id, mp.nombre AS metodo
      FROM pagos_venta pv
      JOIN metodos_pago mp ON pv.metodo_id = mp.id
      WHERE pv.venta_id = $1
    `, [venta_id]);

    res.json({
      venta_id,
      pagos: pagosResult.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Listar pagos con filtros (venta_id, metodo_id)
exports.list = async (req, res) => {
  try {
    const usuario = req.usuario;
    const { venta_id, metodo_id } = req.query;

    let query = `SELECT pv.id, pv.venta_id, pv.metodo_id, mp.nombre AS metodo, pv.monto, v.fecha AS fecha_venta
                 FROM pagos_venta pv
                 JOIN metodos_pago mp ON pv.metodo_id = mp.id
                 JOIN ventas v ON pv.venta_id = v.id
                 WHERE pv.negocio_id = $1`;
    const params = [usuario.negocio_id];

    if (venta_id) {
      params.push(venta_id);
      query += ` AND pv.venta_id = $${params.length}`;
    }

    if (metodo_id) {
      params.push(metodo_id);
      query += ` AND pv.metodo_id = $${params.length}`;
    }

    query += ` ORDER BY v.fecha DESC`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Obtener pago por ID
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;

    const result = await db.query(`
      SELECT pv.id, pv.venta_id, pv.metodo_id, mp.nombre AS metodo, pv.monto, v.fecha AS fecha_venta, pv.negocio_id
      FROM pagos_venta pv
      JOIN metodos_pago mp ON pv.metodo_id = mp.id
      JOIN ventas v ON pv.venta_id = v.id
      WHERE pv.id = $1
    `, [id]);

    if (result.rows.length === 0) return res.status(404).json({ message: 'Pago no encontrado' });

    const pago = result.rows[0];
    if (pago.negocio_id && pago.negocio_id !== usuario.negocio_id && usuario.rol !== 'superadmin') {
      return res.status(403).json({ message: 'Acceso denegado a este pago' });
    }

    res.json(pago);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Actualizar pago (solo admin/superadmin)
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { metodo_id, monto } = req.body;

    const result = await db.query(
      `UPDATE pagos_venta SET metodo_id=$1, monto=$2 WHERE id=$3 RETURNING *`,
      [metodo_id, monto, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: 'Pago no encontrado' });

    res.json({ message: 'Pago actualizado', pago: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Eliminar pago (hard delete)
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(`DELETE FROM pagos_venta WHERE id=$1 RETURNING *`, [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Pago no encontrado' });

    res.json({ message: 'Pago eliminado', pago: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Reembolso simple: eliminar pago y (opcional) registrar movimiento de caja
exports.refund = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const pagoRes = await client.query(`SELECT * FROM pagos_venta WHERE id=$1 FOR UPDATE`, [id]);
      if (pagoRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Pago no encontrado' });
      }
      const pago = pagoRes.rows[0];
      if (pago.anulada) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Pago ya fue anulado' });
      }

      // Obtener venta y local
      const ventaRes = await client.query(`SELECT id, local_id, negocio_id FROM ventas WHERE id=$1`, [pago.venta_id]);
      if (ventaRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Venta asociada no encontrada' });
      }
      const venta = ventaRes.rows[0];

      // Buscar turno abierto para el local (para registrar el retiro)
      const turnoRes = await client.query(
        `SELECT id FROM turnos WHERE local_id=$1 AND estado='abierto' ORDER BY fecha_apertura DESC LIMIT 1`,
        [venta.local_id]
      );
      if (turnoRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'No hay un turno abierto en el local para registrar el reembolso' });
      }
      const turno_id = turnoRes.rows[0].id;

      // Registrar retiro (reembolso) en retiros_caja
      await client.query(
        `INSERT INTO retiros_caja (turno_id, usuario_id, negocio_id, local_id, monto, motivo) VALUES ($1, $2, $3, $4, $5, $6)`,
        [turno_id, usuario.id, venta.negocio_id || pago.negocio_id, venta.local_id, pago.monto, `Reembolso pago ${pago.id}`]
      );

      // Marcar pago como anulado
      await client.query(`UPDATE pagos_venta SET anulada = TRUE WHERE id=$1`, [id]);

      await client.query('COMMIT');
      res.json({ message: 'Reembolso registrado y pago anulado', pago });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};