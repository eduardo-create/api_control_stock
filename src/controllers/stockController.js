const db = require('../db');

// Verifica que el usuario pueda acceder al local pedido y devuelve ids normalizados
async function validarAccesoLocal(usuario, localIdRaw) {
  const localId = parseInt(localIdRaw, 10);
  if (Number.isNaN(localId)) {
    return { ok: false, status: 400, message: "local_id inválido" };
  }

  const localRes = await db.query('SELECT negocio_id FROM locales WHERE id=$1', [localId]);
  if (localRes.rows.length === 0) {
    return { ok: false, status: 404, message: "Local no encontrado" };
  }

  const negocioIdLocal = localRes.rows[0].negocio_id;

  // superadmin puede ver todos; admin cualquier local de su negocio; vendedor solo su local
  if (usuario.rol === 'superadmin') {
    return { ok: true, localId, negocioId: negocioIdLocal };
  }

  if (negocioIdLocal !== usuario.negocio_id) {
    return { ok: false, status: 403, message: "No tienes permiso para acceder a este local" };
  }

  if (usuario.rol === 'vendedor' && usuario.local_id !== localId) {
    return { ok: false, status: 403, message: "No tienes permiso para acceder a este local" };
  }

  return { ok: true, localId, negocioId: negocioIdLocal };
}

// Consultar stock por local
exports.getByLocal = async (req, res) => {
  try {
    const { local_id } = req.params;
    const usuario = req.usuario;

    const acceso = await validarAccesoLocal(usuario, local_id);
    if (!acceso.ok) {
      return res.status(acceso.status).json({ message: acceso.message });
    }

    const result = await db.query(`
      SELECT i.id AS insumo_id,
             i.nombre AS insumo,
             i.unidad,
             sl.cantidad,
             l.nombre AS local
      FROM stock_local sl
      JOIN insumos i ON sl.insumo_id = i.id
      JOIN locales l ON sl.local_id = l.id
      WHERE sl.local_id = $1
      ORDER BY i.nombre;
    `, [acceso.localId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No se encontró stock para este local" });
    }

    res.json({
      local: result.rows[0].local,
      insumos: result.rows.map(row => ({
        insumo_id: row.insumo_id,
        nombre: row.insumo,
        unidad: row.unidad,
        cantidad: row.cantidad
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// Movimientos agrupados con filtros opcionales
exports.getMovimientosGrouped = async (req, res) => {
  try {
    const { local_id } = req.params;
    const usuario = req.usuario;

    const acceso = await validarAccesoLocal(usuario, local_id);
    if (!acceso.ok) {
      return res.status(acceso.status).json({ message: acceso.message });
    }

    const { desde, hasta, insumo_id } = req.query;
    let desdeCompleto = desde ? `${desde} 00:00:00` : null;
    let hastaCompleto = hasta ? `${hasta} 23:59:59` : null;

    let compraConditions = [`c.local_id = $1`];
    let ventaConditions = [`v.local_id = $1`];
    let params = [acceso.localId];
    let paramIndex = 2;

    if (desdeCompleto) {
      compraConditions.push(`c.fecha >= $${paramIndex}::timestamp`);
      ventaConditions.push(`v.fecha >= $${paramIndex}::timestamp`);
      params.push(desdeCompleto);
      paramIndex++;
    }

    if (hastaCompleto) {
      compraConditions.push(`c.fecha <= $${paramIndex}::timestamp`);
      ventaConditions.push(`v.fecha <= $${paramIndex}::timestamp`);
      params.push(hastaCompleto);
      paramIndex++;
    }

    if (insumo_id) {
      compraConditions.push(`dc.insumo_id = $${paramIndex}`);
      ventaConditions.push(`r.insumo_id = $${paramIndex}`);
      params.push(insumo_id);
      paramIndex++;
    }

    const compraWhere = compraConditions.length ? `WHERE ${compraConditions.join(' AND ')}` : '';
    const ventaWhere = ventaConditions.length ? `WHERE ${ventaConditions.join(' AND ')}` : '';

    const result = await db.query(`
      -- Compras
      SELECT 
        c.id AS movimiento_id,
        c.fecha,
        'COMPRA' AS tipo,
        p.nombre AS actor,
        i.nombre AS insumo,
        dc.cantidad,
        dc.precio_unitario,
        (dc.cantidad * dc.precio_unitario) AS total
      FROM compras c
      JOIN detalle_compra dc ON c.id = dc.compra_id
      JOIN insumos i ON dc.insumo_id = i.id
      JOIN proveedores p ON c.proveedor_id = p.id
      ${compraWhere}

      UNION ALL

      -- Ventas
      SELECT 
        v.id AS movimiento_id,
        v.fecha,
        'VENTA' AS tipo,
        u.nombre AS actor,
        i.nombre AS insumo,
        (r.cantidad * dv.cantidad) AS cantidad,
        NULL AS precio_unitario,
        v.total AS total
      FROM ventas v
      JOIN usuarios u ON v.usuario_id = u.id
      JOIN detalle_venta dv ON v.id = dv.venta_id
      JOIN recetas r ON dv.producto_id = r.producto_id
      JOIN insumos i ON r.insumo_id = i.id
      ${ventaWhere}

      ORDER BY fecha DESC;
    `, params);

    // Agrupar por movimiento_id
    const movimientosMap = {};
    result.rows.forEach(row => {
      if (!movimientosMap[row.movimiento_id]) {
        movimientosMap[row.movimiento_id] = {
          movimiento_id: row.movimiento_id,
          fecha: row.fecha,
          tipo: row.tipo,
          actor: row.actor,
          insumos: [],
          total: row.total
        };
      }
      movimientosMap[row.movimiento_id].insumos.push({
        nombre: row.insumo,
        cantidad: row.cantidad,
        precio_unitario: row.precio_unitario
      });
    });

    const movimientos = Object.values(movimientosMap);

    if (movimientos.length === 0) {
      return res.status(404).json({ message: "No se encontraron movimientos con los filtros aplicados" });
    }

    res.json({ local_id, filtros: { desde, hasta, insumo_id }, movimientos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Resumen de stock por rango de fechas
exports.getResumen = async (req, res) => {
  try {
    const { local_id } = req.params;
    const usuario = req.usuario;

    const acceso = await validarAccesoLocal(usuario, local_id);
    if (!acceso.ok) {
      return res.status(acceso.status).json({ message: acceso.message });
    }

    const { desde, hasta } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ message: "Debes indicar 'desde' y 'hasta' en formato YYYY-MM-DD" });
    }

    const desdeCompleto = `${desde} 00:00:00`;
    const hastaCompleto = `${hasta} 23:59:59`;

    // Stock inicial
    const stockInicial = await db.query(`
      SELECT i.id AS insumo_id, i.nombre, i.unidad, sl.cantidad
      FROM stock_local sl
      JOIN insumos i ON sl.insumo_id = i.id
      WHERE sl.local_id = $1
    `, [acceso.localId]);

    // Movimientos dentro del rango
    const movimientos = await db.query(`
      -- Compras
      SELECT 
        c.fecha,
        'COMPRA' AS tipo,
        i.nombre AS insumo,
        dc.cantidad,
        dc.precio_unitario,
        (dc.cantidad * dc.precio_unitario) AS total
      FROM compras c
      JOIN detalle_compra dc ON c.id = dc.compra_id
      JOIN insumos i ON dc.insumo_id = i.id
      WHERE c.local_id = $1
        AND c.fecha BETWEEN $2::timestamp AND $3::timestamp

      UNION ALL

      -- Ventas
      SELECT 
        v.fecha,
        'VENTA' AS tipo,
        i.nombre AS insumo,
        (r.cantidad * dv.cantidad) AS cantidad,
        NULL AS precio_unitario,
        NULL AS total
      FROM ventas v
      JOIN detalle_venta dv ON v.id = dv.venta_id
      JOIN recetas r ON dv.producto_id = r.producto_id
      JOIN insumos i ON r.insumo_id = i.id
      WHERE v.local_id = $1
        AND v.fecha BETWEEN $2::timestamp AND $3::timestamp

      ORDER BY fecha ASC;
    `, [local_id, desdeCompleto, hastaCompleto]);

    // Stock final
    const stockFinal = await db.query(`
      SELECT i.id AS insumo_id, i.nombre, i.unidad, sl.cantidad
      FROM stock_local sl
      JOIN insumos i ON sl.insumo_id = i.id
      WHERE sl.local_id = $1
    `, [acceso.localId]);

    res.json({
      local_id: acceso.localId,
      rango: { desde, hasta },
      stock_inicial: stockInicial.rows,
      movimientos: movimientos.rows,
      stock_final: stockFinal.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Ajuste manual de stock
exports.ajusteStock = async (req, res) => {
  try {
    const { local_id, insumo_id, cantidad, motivo } = req.body;
    const usuario = req.usuario; // viene del token

    const acceso = await validarAccesoLocal(usuario, local_id);
    if (!acceso.ok) {
      return res.status(acceso.status).json({ message: acceso.message });
    }

    if (!local_id || !insumo_id || cantidad === undefined) {
      return res.status(400).json({ message: "local_id, insumo_id y cantidad son obligatorios" });
    }

    // Usar transacción y lock para evitar condiciones de carrera
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Bloquear fila del stock_local
      const stockRes = await client.query(
        `SELECT cantidad FROM stock_local WHERE local_id = $1 AND insumo_id = $2 FOR UPDATE`,
        [acceso.localId, insumo_id]
      );

      if (stockRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: "Producto no encontrado en stock" });
      }

      const current = parseFloat(stockRes.rows[0].cantidad);
      const nuevaCantidad = current + parseFloat(cantidad);

      if (nuevaCantidad < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: "Stock insuficiente, la cantidad no puede ser menor a cero" });
      }

      const updateRes = await client.query(
        `UPDATE stock_local SET cantidad = $1 WHERE local_id = $2 AND insumo_id = $3 RETURNING *`,
        [nuevaCantidad, acceso.localId, insumo_id]
      );

      // Registrar movimiento con usuario del token
      await client.query(
        `INSERT INTO movimientos_stock (local_id, insumo_id, cantidad, tipo, motivo, usuario_id, fecha)
         VALUES ($1, $2, $3, 'AJUSTE_STOCK', $4, $5, CURRENT_TIMESTAMP)`,
        [acceso.localId, insumo_id, cantidad, motivo, usuario.id]
      );

      await client.query('COMMIT');

      res.json({
        message: "Ajuste de stock registrado correctamente",
        stock: updateRes.rows[0]
      });
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

// Movimientos de stock por local
exports.getMovimientos = async (req, res) => {
  try {
    const { local_id } = req.params;
    const usuario = req.usuario;

    const acceso = await validarAccesoLocal(usuario, local_id);
    if (!acceso.ok) {
      return res.status(acceso.status).json({ message: acceso.message });
    }

    const result = await db.query(
      `SELECT m.id,
              m.fecha,
              m.tipo,              -- entrada, salida, ajuste
              m.cantidad,
              i.nombre AS insumo,
              u.nombre AS usuario,
              m.motivo
       FROM movimientos_stock m
       JOIN insumos i ON m.insumo_id = i.id
       JOIN usuarios u ON m.usuario_id = u.id
      WHERE m.local_id = $1
       ORDER BY m.fecha DESC`,
          [acceso.localId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No se encontraron movimientos de stock para este local" });
    }

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};