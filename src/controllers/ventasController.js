const db = require('../db');
const { registrarMovimiento } = require('../utils/movimientosProductos');

// Crear una venta con productos y pagos, asociada al turno activo
exports.create = async (req, res) => {
  const client = await db.connect();
  try {
    const {
      productos,
      pagos = [],
      promociones = [],
      cliente_id,
      emit_comprobante,
      tipo_comprobante,
      turno_aplicado,
      descuento_monto = 0,
      descuento_porcentaje = 0,
      cupon_codigo = null,
      cupon_monto = 0,
      adicional_manual = 0,
      paga_con = null,
      vuelto = 0,
      cobrado = true,
      observaciones = null,
      empleado_id = null
    } = req.body;
    const usuario = req.usuario; // viene del token JWT

    const local_id = usuario.local_id || req.body.local_id;
    const usuario_id = usuario.id;
    const negocio_id = usuario.negocio_id;

    if (!local_id) {
      return res.status(400).json({ message: 'El usuario no tiene local asignado y no se envió local_id' });
    }

    const hayProductos = Array.isArray(productos) && productos.length > 0;
    const hayPromos = Array.isArray(promociones) && promociones.length > 0;

    if (!hayProductos && !hayPromos) {
      return res.status(400).json({ message: 'Se debe enviar al menos un producto o una promoción para la venta' });
    }
    if (cobrado && (!Array.isArray(pagos) || pagos.length === 0)) {
      return res.status(400).json({ message: 'Se debe enviar al menos un pago para la venta cobrada' });
    }

    // Buscar turno abierto en el local
    const turnoResult = await client.query(
      `SELECT id, saldo_inicial, saldo_final
       FROM turnos
       WHERE local_id=$1 AND estado='abierto'
       ORDER BY fecha_apertura DESC LIMIT 1`,
      [local_id]
    );

    if (turnoResult.rows.length === 0) {
      return res.status(400).json({ message: "No hay turno abierto en este local" });
    }

    const turno = turnoResult.rows[0];

    // Pre-chequeo de stock sumando carrito + promos para dar error claro antes de operar
    const needs = new Map(); // producto_id -> cantidad requerida total

    for (const item of productos || []) {
      if (!item?.producto_id || !item?.cantidad) continue;
      const pid = Number(item.producto_id);
      const qty = Number(item.cantidad) || 0;
      needs.set(pid, (needs.get(pid) || 0) + qty);
    }

    for (const promoItem of promociones || []) {
      const { items = [], cantidad = 1 } = promoItem || {};
      for (const comp of items) {
        if (!comp?.producto_id || !comp?.cantidad) continue;
        const pid = Number(comp.producto_id);
        const qty = (Number(comp.cantidad) || 0) * (Number(cantidad) || 1);
        needs.set(pid, (needs.get(pid) || 0) + qty);
      }
    }

    if (needs.size > 0) {
      const productIds = Array.from(needs.keys());
      const stockRes = await client.query(
        'SELECT id, stock_total, nombre FROM productos WHERE id = ANY($1)',
        [productIds]
      );
      const stockMap = new Map();
      stockRes.rows.forEach(r => stockMap.set(Number(r.id), { stock: Number(r.stock_total) || 0, nombre: r.nombre }));

      for (const [pid, required] of needs.entries()) {
        const info = stockMap.get(pid);
        if (!info) {
          throw new Error(`Producto ${pid} no encontrado`);
        }
        if (info.stock < required) {
          throw new Error(`Stock insuficiente para ${info.nombre || `producto ${pid}`}: requiere ${required}, hay ${info.stock}`);
        }
      }
    }

    await client.query('BEGIN');

    // Crear venta asociada al turno (inicialmente total 0)
    const ventaResult = await client.query(
      `INSERT INTO ventas (
         local_id, usuario_id, turno_id, total, cliente_id, total_descuento, negocio_id,
         descuento_monto, descuento_porcentaje, cupon_codigo, cupon_monto, adicional_manual,
         paga_con, vuelto, cobrado, observaciones, empleado_id, monto_pagado, saldo_pendiente, estado_cobro
       ) VALUES (
         $1, $2, $3, 0, $4, 0, $5,
         $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, 0, 0, 'pendiente'
       ) RETURNING id`,
      [
        local_id,
        usuario_id,
        turno.id,
        cliente_id || null,
        negocio_id,
        parseFloat(descuento_monto) || 0,
        parseFloat(descuento_porcentaje) || 0,
        cupon_codigo || null,
        parseFloat(cupon_monto) || 0,
        parseFloat(adicional_manual) || 0,
        paga_con !== null && paga_con !== undefined && paga_con !== '' ? parseFloat(paga_con) : null,
        parseFloat(vuelto) || 0,
        !!cobrado,
        observaciones || null,
        empleado_id || usuario_id
      ]
    );
    const ventaId = ventaResult.rows[0].id;

    let totalVenta = 0;
    let totalDescuento = 0;

    for (const item of productos || []) {
      const { producto_id, cantidad, descuento } = item;

      const prodResult = await client.query(
        'SELECT precio, stock_total FROM productos WHERE id=$1 FOR UPDATE',
        [producto_id]
      );
      if (prodResult.rows.length === 0) {
        throw new Error(`Producto con id ${producto_id} no encontrado`);
      }

      const precio = parseFloat(prodResult.rows[0].precio);
      const stockProducto = parseFloat(prodResult.rows[0].stock_total);
      const lineDescuento = descuento ? parseFloat(descuento) : 0;
      const rawSubtotal = precio * cantidad;
      const subtotal = Math.max(0, rawSubtotal - lineDescuento);
      totalVenta += subtotal;
      totalDescuento += lineDescuento;

      if (stockProducto < cantidad) {
        throw new Error(`Stock insuficiente para producto ${producto_id}`);
      }

      await client.query(
        'INSERT INTO detalle_venta (venta_id, producto_id, cantidad, subtotal) VALUES ($1, $2, $3, $4)',
        [ventaId, producto_id, cantidad, subtotal]
      );

      await client.query(
        'UPDATE productos SET stock_total = stock_total - $1 WHERE id=$2',
        [cantidad, producto_id]
      );

      await registrarMovimiento({
        client,
        negocio_id,
        local_id,
        producto_id,
        cantidad: -cantidad,
        tipo: 'venta',
        motivo: null,
        usuario_id,
        referencia: { venta_id: ventaId }
      });
    }

    // Procesar promociones
    for (const promoItem of promociones || []) {
      const { promocion_id, cantidad = 1, items = [] } = promoItem;
      if (!promocion_id) throw new Error('promocion_id es obligatorio');
      if (cantidad <= 0) throw new Error('Cantidad de promoción debe ser mayor a cero');

      const promoRes = await client.query(
        `SELECT p.*, COALESCE(array_agg(d.dia) FILTER (WHERE d.dia IS NOT NULL), '{}') AS dias
         FROM promociones p
         LEFT JOIN promocion_dias d ON d.promocion_id = p.id
         WHERE p.id = $1 AND p.negocio_id = $2 AND p.activo = TRUE
         GROUP BY p.id`,
        [promocion_id, negocio_id]
      );

      if (promoRes.rows.length === 0) {
        throw new Error(`Promoción ${promocion_id} no válida para este negocio`);
      }

      const promo = promoRes.rows[0];
      const hoy = new Date();
      const diaSemana = hoy.getDay();
      const fechaHoy = new Date(hoy);
      fechaHoy.setHours(0, 0, 0, 0);
      const fechaDesde = promo.valido_desde ? new Date(promo.valido_desde) : null;
      const fechaHasta = promo.valido_hasta ? new Date(promo.valido_hasta) : null;
      if (fechaDesde) fechaDesde.setHours(0, 0, 0, 0);
      if (fechaHasta) fechaHasta.setHours(0, 0, 0, 0);

      if (fechaDesde && fechaHoy < fechaDesde) {
        throw new Error(`Promoción ${promo.nombre} aún no está vigente`);
      }
      if (fechaHasta && fechaHoy > fechaHasta) {
        throw new Error(`Promoción ${promo.nombre} está vencida`);
      }
      if (promo.dias && Array.isArray(promo.dias) && promo.dias.length > 0 && !promo.dias.includes(diaSemana)) {
        throw new Error(`Promoción ${promo.nombre} no aplica hoy`);
      }
      const turnoCheck = promo.turno || 'todos';
      const turnoActual = turno_aplicado || 'todos';
      if (turnoCheck !== 'todos' && turnoCheck !== turnoActual) {
        throw new Error(`Promoción ${promo.nombre} no aplica al turno actual`);
      }
      if (promo.limite_por_pedido && cantidad > promo.limite_por_pedido) {
        throw new Error(`Promoción ${promo.nombre} excede el límite por pedido (${promo.limite_por_pedido})`);
      }

      if (!Array.isArray(items) || items.length === 0) {
        throw new Error(`Promoción ${promo.nombre} requiere productos que la componen`);
      }

      const precioFinalPromo = parseFloat(promo.precio_final);
      const subtotalPromo = precioFinalPromo * cantidad;
      totalVenta += subtotalPromo;

      const ventaPromoRes = await client.query(
        `INSERT INTO venta_promociones (venta_id, promocion_id, cantidad, precio_unitario, subtotal, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [ventaId, promocion_id, cantidad, precioFinalPromo, subtotalPromo, JSON.stringify({ items })]
      );
      const ventaPromoId = ventaPromoRes.rows[0].id;

      // Descontar stock de los productos seleccionados
      for (const comp of items) {
        const producto_id = comp.producto_id;
        const cantidadComp = comp.cantidad;
        if (!producto_id || !cantidadComp) {
          throw new Error(`Producto y cantidad son obligatorios en los items de la promoción ${promo.nombre}`);
        }

        const prodResult = await client.query(
          'SELECT precio, stock_total FROM productos WHERE id=$1 FOR UPDATE',
          [producto_id]
        );
        if (prodResult.rows.length === 0) {
          throw new Error(`Producto con id ${producto_id} no encontrado`);
        }

        const stockProducto = parseFloat(prodResult.rows[0].stock_total);
        if (stockProducto < cantidadComp * cantidad) {
          throw new Error(`Stock insuficiente para producto ${producto_id} en promoción`);
        }

        await client.query(
          `INSERT INTO venta_promocion_items (venta_promocion_id, producto_id, cantidad, subtotal)
           VALUES ($1, $2, $3, 0)`,
          [ventaPromoId, producto_id, cantidadComp * cantidad]
        );

        await client.query(
          'UPDATE productos SET stock_total = stock_total - $1 WHERE id=$2',
          [cantidadComp * cantidad, producto_id]
        );

        await registrarMovimiento({
          client,
          negocio_id,
          local_id,
          producto_id,
          cantidad: -(cantidadComp * cantidad),
          tipo: 'venta_promo',
          motivo: `Promocion ${promocion_id}`,
          usuario_id,
          referencia: { venta_id: ventaId, promocion_id }
        });
      }
    }

    const descMontoNum = parseFloat(descuento_monto) || 0;
    const descPctNum = parseFloat(descuento_porcentaje) || 0;
    const descPctMonto = descPctNum > 0 ? (totalVenta * (descPctNum / 100)) : 0;
    const cuponMontoNum = parseFloat(cupon_monto) || 0;
    const adicionalNum = parseFloat(adicional_manual) || 0;

    const totalDescuentosExtra = descMontoNum + descPctMonto + cuponMontoNum;
    const totalFinal = Math.max(0, totalVenta + adicionalNum - totalDescuentosExtra);

    const pagosAplicables = cobrado ? pagos : [];
    const totalPagos = pagosAplicables.reduce((sum, p) => sum + parseFloat(p.monto || 0), 0);

    // Validar pagos vs total solo si está cobrado
    if (cobrado && Math.abs(totalPagos - totalFinal) > 0.02) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: "La suma de pagos no coincide con el total de la venta",
        totalProductos: totalFinal,
        totalPagos
      });
    }

    for (const pago of pagosAplicables) {
      await client.query(
        'INSERT INTO pagos_venta (venta_id, metodo_id, monto, negocio_id) VALUES ($1, $2, $3, $4)',
        [ventaId, pago.metodo_id, pago.monto, usuario.negocio_id]
      );
    }

    const montoPagado = cobrado ? totalPagos : 0;
    const saldoPendiente = Math.max(0, totalFinal - montoPagado);
    const estadoCobro = saldoPendiente > 0.02 ? (montoPagado > 0 ? 'parcial' : 'pendiente') : 'cobrado';

    await client.query(
      `UPDATE ventas SET
         total=$1,
         total_descuento=$2,
         descuento_monto=$3,
         descuento_porcentaje=$4,
         cupon_codigo=$5,
         cupon_monto=$6,
         adicional_manual=$7,
         paga_con=$8,
         vuelto=$9,
         cobrado=$10,
         observaciones=$11,
         empleado_id=$12,
         monto_pagado=$13,
         saldo_pendiente=$14,
         estado_cobro=$15
       WHERE id=$16`,
      [
        totalFinal,
        totalDescuento + totalDescuentosExtra,
        descMontoNum,
        descPctNum,
        cupon_codigo || null,
        cuponMontoNum,
        adicionalNum,
        paga_con !== null && paga_con !== undefined && paga_con !== '' ? parseFloat(paga_con) : null,
        parseFloat(vuelto) || 0,
        !!cobrado,
        observaciones || null,
        empleado_id || usuario_id,
        montoPagado,
        saldoPendiente,
        estadoCobro,
        ventaId
      ]
    );

    // Registrar movimiento en caja_turno (para el historial de caja) solo si hay cobro efectivo
    if (cobrado && totalPagos > 0) {
      const cajaTurnoRes = await client.query(
        `SELECT id FROM caja_turno
         WHERE local_id = $1 AND estado = 'abierta'
         ORDER BY hora_apertura DESC
         LIMIT 1`,
        [local_id]
      );

      if (cajaTurnoRes.rows.length === 0) {
        throw new Error('No hay caja abierta para registrar el movimiento de venta');
      }

      const cajaTurnoId = cajaTurnoRes.rows[0].id;

      await client.query(
        `INSERT INTO movimientos_caja (turno_id, usuario_id, tipo, descripcion, monto, fecha)
         VALUES ($1, $2, 'VENTA', $3, $4, CURRENT_TIMESTAMP)`,
        [cajaTurnoId, usuario_id, `Venta ${ventaId}`, totalPagos]
      );
    }

    // Si se solicita, crear comprobante esqueleto
    let comprobante = null;
    if (emit_comprobante && tipo_comprobante) {
      const resCom = await client.query(
        `INSERT INTO comprobantes (venta_id, tipo_comprobante, numero, cae, fecha_emision, monto, negocio_id, meta)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5, $6, $7) RETURNING *`,
        [ventaId, tipo_comprobante, null, null, totalFinal, usuario.negocio_id, JSON.stringify({ created_by: usuario.id })]
      );
      comprobante = resCom.rows[0];
      await client.query(`UPDATE ventas SET comprobante_id=$1 WHERE id=$2`, [comprobante.id, ventaId]);
    }

    // Actualizar saldo del turno solo por lo cobrado
    if (cobrado && totalPagos > 0) {
      const saldoActual = turno.saldo_final ?? turno.saldo_inicial;
      await client.query(
        'UPDATE turnos SET saldo_final=$1 WHERE id=$2',
        [saldoActual + totalPagos, turno.id]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({
      message: 'Venta registrada',
      ventaId,
      total: totalFinal,
      total_descuento: totalDescuento + totalDescuentosExtra,
      estado_cobro: cobrado ? 'cobrado' : 'pendiente',
      comprobante,
      pagos: pagosAplicables
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en venta:', err);
    // Responder 400 para errores esperables de negocio (stock, promo, validación) y 500 para lo demás
    const msg = err.message || 'Error al registrar la venta';
    const status = /stock|promoc|turno|pago|producto|cliente|método|metodo|aplica/i.test(msg) ? 400 : 500;
    res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
};

// Feed para el POS: ventas del día del local del usuario, con items y pagos
exports.posFeed = async (req, res) => {
  try {
    const usuario = req.usuario;
    const localId = usuario.local_id || req.query.local_id;
    if (!localId) {
      return res.status(400).json({ message: 'El usuario no tiene local asignado y no se envió local_id' });
    }

    const fecha = (req.query.fecha || new Date().toISOString().slice(0, 10));
    const limit = Math.min(Number(req.query.limit) || 30, 100);

    const result = await db.query(
      `SELECT
         v.id,
         v.fecha,
         v.total,
         v.cobrado,
         v.estado_cobro,
         v.observaciones,
         v.cliente_id,
         COALESCE(cli.nombre, 'Sin nombre') AS cliente,
         v.empleado_id,
         emp.nombre AS empleado,
         v.monto_pagado,
         v.saldo_pendiente,
         v.paga_con,
         v.vuelto,
         det.items,
         promo.promos,
         pay.pagos
       FROM ventas v
       LEFT JOIN clientes cli ON cli.id = v.cliente_id
       LEFT JOIN usuarios emp ON emp.id = v.empleado_id
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object(
           'producto_id', dv.producto_id,
           'nombre', p.nombre,
           'cantidad', dv.cantidad,
           'subtotal', dv.subtotal,
           'precio_unitario', CASE WHEN dv.cantidad <> 0 THEN dv.subtotal / dv.cantidad ELSE 0 END
         ) ORDER BY dv.id) AS items
         FROM detalle_venta dv
         JOIN productos p ON p.id = dv.producto_id
         WHERE dv.venta_id = v.id
       ) det ON TRUE
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object(
           'promocion_id', vp.promocion_id,
           'nombre', pr.nombre,
           'cantidad', vp.cantidad,
           'subtotal', vp.subtotal
         ) ORDER BY vp.id) AS promos
         FROM venta_promociones vp
         JOIN promociones pr ON pr.id = vp.promocion_id
         WHERE vp.venta_id = v.id
       ) promo ON TRUE
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object(
           'metodo_id', pv.metodo_id,
           'metodo', mp.nombre,
           'monto', pv.monto
         ) ORDER BY pv.id) AS pagos
         FROM pagos_venta pv
         LEFT JOIN metodos_pago mp ON mp.id = pv.metodo_id
         WHERE pv.venta_id = v.id
       ) pay ON TRUE
       WHERE v.negocio_id = $1
         AND v.local_id = $2
         AND v.fecha::date = $3
       ORDER BY v.fecha DESC
       LIMIT $4`,
      [usuario.negocio_id, localId, fecha, limit]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error en posFeed:', err);
    res.status(500).json({ error: err.message || 'Error al obtener ventas' });
  }
};

// Actualizar cobro de una venta pendiente/parcial
exports.updateCobro = async (req, res) => {
  const client = await db.connect();
  try {
    const usuario = req.usuario;
    const { id } = req.params;
    const {
      cobrado = false,
      pagos = [],
      observaciones = null,
      empleado_id = null,
      paga_con = null,
      vuelto = 0
    } = req.body;

    const ventaRes = await client.query(
      `SELECT v.*, l.negocio_id AS local_negocio
       FROM ventas v
       JOIN locales l ON l.id = v.local_id
       WHERE v.id = $1 AND l.negocio_id = $2`,
      [id, usuario.negocio_id]
    );

    if (ventaRes.rows.length === 0) {
      return res.status(404).json({ message: 'Venta no encontrada' });
    }

    const venta = ventaRes.rows[0];
    if (venta.cobrado) {
      return res.status(400).json({ message: 'La venta ya está cobrada, anula para revertir' });
    }

    const totalVenta = Number(venta.total) || 0;
    const pagosAplicables = cobrado ? pagos : [];
    const totalPagos = pagosAplicables.reduce((sum, p) => sum + parseFloat(p.monto || 0), 0);

    if (cobrado && Math.abs(totalPagos - totalVenta) > 0.02) {
      return res.status(400).json({ message: 'Los pagos no coinciden con el total de la venta' });
    }

    await client.query('BEGIN');

    await client.query('DELETE FROM pagos_venta WHERE venta_id = $1', [id]);
    for (const pago of pagosAplicables) {
      if (!pago.metodo_id) continue;
      await client.query(
        'INSERT INTO pagos_venta (venta_id, metodo_id, monto, negocio_id) VALUES ($1, $2, $3, $4)',
        [id, pago.metodo_id, parseFloat(pago.monto || 0), usuario.negocio_id]
      );
    }

    const monto_pagado = cobrado ? totalPagos : 0;
    const saldo_pendiente = Math.max(0, totalVenta - monto_pagado);
    const estado_cobro = cobrado ? 'cobrado' : (monto_pagado > 0 ? 'parcial' : 'pendiente');

    await client.query(
      `UPDATE ventas SET
         cobrado=$1,
         observaciones=$2,
         empleado_id=$3,
         paga_con=$4,
         vuelto=$5,
         monto_pagado=$6,
         saldo_pendiente=$7,
         estado_cobro=$8
       WHERE id=$9`,
      [
        !!cobrado,
        observaciones || null,
        empleado_id || usuario.id,
        paga_con !== null && paga_con !== undefined && paga_con !== '' ? parseFloat(paga_con) : null,
        parseFloat(vuelto) || 0,
        monto_pagado,
        saldo_pendiente,
        estado_cobro,
        id
      ]
    );

    if (cobrado && totalPagos > 0) {
      const cajaTurnoRes = await client.query(
        `SELECT id FROM caja_turno
         WHERE local_id = $1 AND estado = 'abierta'
         ORDER BY hora_apertura DESC
         LIMIT 1`,
        [venta.local_id]
      );

      if (cajaTurnoRes.rows.length === 0) {
        throw new Error('No hay caja abierta para registrar el cobro');
      }

      const cajaTurnoId = cajaTurnoRes.rows[0].id;

      await client.query(
        `INSERT INTO movimientos_caja (turno_id, usuario_id, tipo, descripcion, monto, fecha)
         VALUES ($1, $2, 'VENTA', $3, $4, CURRENT_TIMESTAMP)`,
        [cajaTurnoId, usuario.id, `Cobro venta ${id}`, totalPagos]
      );

      const turnoId = venta.turno_id;
      if (turnoId) {
        const turnoRes = await client.query('SELECT saldo_inicial, saldo_final FROM turnos WHERE id=$1', [turnoId]);
        if (turnoRes.rows.length > 0) {
          const saldoActual = turnoRes.rows[0].saldo_final ?? turnoRes.rows[0].saldo_inicial;
          await client.query('UPDATE turnos SET saldo_final=$1 WHERE id=$2', [saldoActual + totalPagos, turnoId]);
        }
      }
    }

    await client.query('COMMIT');

    const detailRes = await db.query(
      `SELECT
         v.id,
         v.fecha,
         v.total,
         v.cobrado,
         v.estado_cobro,
         v.observaciones,
         v.cliente_id,
         COALESCE(cli.nombre, 'Sin nombre') AS cliente,
         v.empleado_id,
         emp.nombre AS empleado,
         v.monto_pagado,
         v.saldo_pendiente,
         v.paga_con,
         v.vuelto,
         det.items,
         promo.promos,
         pay.pagos
       FROM ventas v
       LEFT JOIN clientes cli ON cli.id = v.cliente_id
       LEFT JOIN usuarios emp ON emp.id = v.empleado_id
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object(
           'producto_id', dv.producto_id,
           'nombre', p.nombre,
           'cantidad', dv.cantidad,
           'subtotal', dv.subtotal,
           'precio_unitario', CASE WHEN dv.cantidad <> 0 THEN dv.subtotal / dv.cantidad ELSE 0 END
         ) ORDER BY dv.id) AS items
         FROM detalle_venta dv
         JOIN productos p ON p.id = dv.producto_id
         WHERE dv.venta_id = v.id
       ) det ON TRUE
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object(
           'promocion_id', vp.promocion_id,
           'nombre', pr.nombre,
           'cantidad', vp.cantidad,
           'subtotal', vp.subtotal
         ) ORDER BY vp.id) AS promos
         FROM venta_promociones vp
         JOIN promociones pr ON pr.id = vp.promocion_id
         WHERE vp.venta_id = v.id
       ) promo ON TRUE
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object(
           'metodo_id', pv.metodo_id,
           'metodo', mp.nombre,
           'monto', pv.monto
         ) ORDER BY pv.id) AS pagos
         FROM pagos_venta pv
         LEFT JOIN metodos_pago mp ON mp.id = pv.metodo_id
         WHERE pv.venta_id = v.id
       ) pay ON TRUE
       WHERE v.id = $1`,
      [id]
    );

    res.json(detailRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al actualizar cobro:', err);
    const msg = err.message || 'Error al actualizar la venta';
    const status = /pago|cobro|caja|venta|total|método|metodo/i.test(msg) ? 400 : 500;
    res.status(status).json({ error: msg });
  } finally {
    client.release();
  }
};

// Obtener todas las ventas con detalle
exports.getAll = async (req, res) => {
  try {
    const usuario = req.usuario;

    let query = `
      SELECT v.id AS venta_id,
             v.fecha,
             v.total,
             l.nombre AS local,
             u.nombre AS vendedor,
             dv.producto_id,
             p.nombre AS producto,
             dv.cantidad,
             dv.subtotal
      FROM ventas v
      JOIN locales l ON v.local_id = l.id
      JOIN usuarios u ON v.usuario_id = u.id
      JOIN detalle_venta dv ON v.id = dv.venta_id
      JOIN productos p ON dv.producto_id = p.id
    `;
    let params = [];

    // Si es admin, solo puede ver ventas de su negocio
    if (usuario.rol === 'admin') {
      query += ` WHERE u.negocio_id = $1`;
      params.push(usuario.negocio_id);
    }

    query += ` ORDER BY v.fecha DESC`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Obtener ventas agrupadas con productos
exports.getGrouped = async (req, res) => {
  try {
    const usuario = req.usuario;

    let query = `
      SELECT v.id AS venta_id,
             v.fecha,
             v.total,
             l.nombre AS local,
             u.nombre AS vendedor,
             dv.producto_id,
             p.nombre AS producto,
             dv.cantidad,
             dv.subtotal
      FROM ventas v
      JOIN locales l ON v.local_id = l.id
      JOIN usuarios u ON v.usuario_id = u.id
      JOIN detalle_venta dv ON v.id = dv.venta_id
      JOIN productos p ON dv.producto_id = p.id
    `;
    let params = [];

    // Si es admin, solo puede ver ventas de su negocio
    if (usuario.rol === 'admin') {
      query += ` WHERE u.negocio_id = $1`;
      params.push(usuario.negocio_id);
    }

    query += ` ORDER BY v.fecha DESC`;

    const result = await db.query(query, params);

    // Agrupar ventas con sus productos
    const ventasMap = {};
    result.rows.forEach(row => {
      if (!ventasMap[row.venta_id]) {
        ventasMap[row.venta_id] = {
          venta_id: row.venta_id,
          fecha: row.fecha,
          total: row.total,
          local: row.local,
          vendedor: row.vendedor,
          productos: []
        };
      }
      ventasMap[row.venta_id].productos.push({
        producto_id: row.producto_id,
        producto: row.producto,
        cantidad: row.cantidad,
        subtotal: row.subtotal
      });
    });

    const ventas = Object.values(ventasMap);
    res.json(ventas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Obtener una venta específica con productos y pagos
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;

    const ventaResult = await db.query(`
      SELECT v.id AS venta_id,
             v.fecha,
             v.total,
             v.total_descuento,
             v.cliente_id,
             l.nombre AS local,
             u.nombre AS vendedor,
             u.negocio_id
      FROM ventas v
      JOIN locales l ON v.local_id = l.id
      JOIN usuarios u ON v.usuario_id = u.id
      WHERE v.id = $1
    `, [id]);

    if (ventaResult.rows.length === 0) {
      return res.status(404).json({ message: "Venta no encontrada" });
    }

    const venta = ventaResult.rows[0];

    // Restricción: si es admin, solo puede ver ventas de su negocio
    if (usuario.rol === 'admin' && venta.negocio_id !== usuario.negocio_id) {
      return res.status(403).json({ message: "Acceso denegado a esta venta" });
    }

    const productosResult = await db.query(`
      SELECT dv.producto_id,
             p.nombre AS producto,
             dv.cantidad,
             dv.subtotal
      FROM detalle_venta dv
      JOIN productos p ON dv.producto_id = p.id
      WHERE dv.venta_id = $1
    `, [id]);

    const pagosResult = await db.query(`
      SELECT pv.metodo_id,
             mp.nombre AS metodo,
             pv.monto
      FROM pagos_venta pv
      JOIN metodos_pago mp ON pv.metodo_id = mp.id
      WHERE pv.venta_id = $1
    `, [id]);

    // Promociones y sus items
    const promoRes = await db.query(`
      SELECT vp.id,
             vp.promocion_id,
             vp.cantidad,
             vp.precio_unitario,
             vp.subtotal,
             COALESCE(p.nombre, CONCAT('Promo ', vp.promocion_id)) AS nombre
      FROM venta_promociones vp
      LEFT JOIN promociones p ON p.id = vp.promocion_id
      WHERE vp.venta_id = $1
    `, [id]);

    let promoItemsMap = new Map();
    if (promoRes.rows.length > 0) {
      const promoIds = promoRes.rows.map(p => p.id);
      const itemsRes = await db.query(`
        SELECT vpi.venta_promocion_id,
               vpi.producto_id,
               pr.nombre AS producto,
               vpi.cantidad
        FROM venta_promocion_items vpi
        JOIN productos pr ON pr.id = vpi.producto_id
        WHERE vpi.venta_promocion_id = ANY($1)
      `, [promoIds]);
      promoItemsMap = itemsRes.rows.reduce((map, row) => {
        const arr = map.get(row.venta_promocion_id) || [];
        arr.push({
          producto_id: row.producto_id,
          producto: row.producto,
          cantidad: row.cantidad
        });
        map.set(row.venta_promocion_id, arr);
        return map;
      }, new Map());
    }

    // Obtener cliente si existe
    let cliente = null;
    if (venta.cliente_id) {
      const clienteRes = await db.query(`SELECT id, nombre, email, telefono FROM clientes WHERE id=$1`, [venta.cliente_id]);
      if (clienteRes.rows.length > 0) cliente = clienteRes.rows[0];
    }

    // Obtener comprobante si existe
    let comprobante = null;
    const compRes = await db.query(`SELECT id, tipo_comprobante, numero, cae, fecha_emision, monto FROM comprobantes WHERE venta_id=$1`, [id]);
    if (compRes.rows.length > 0) comprobante = compRes.rows[0];

    res.json({
      venta_id: venta.venta_id,
      fecha: venta.fecha,
      total: venta.total,
      total_descuento: venta.total_descuento || 0,
      cliente,
      local: venta.local,
      vendedor: venta.vendedor,
      productos: productosResult.rows,
      pagos: pagosResult.rows,
      promociones: promoRes.rows.map(p => ({
        id: p.id,
        promocion_id: p.promocion_id,
        nombre: p.nombre,
        cantidad: p.cantidad,
        precio_unitario: p.precio_unitario,
        subtotal: p.subtotal,
        items: promoItemsMap.get(p.id) || []
      })),
      comprobante
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Anular una venta: revertir stock e iniciar reembolsos para pagos
exports.cancel = async (req, res) => {
  const client = await db.connect();
  try {
    const { id } = req.params;
    const usuario = req.usuario;

    await client.query('BEGIN');

    const ventaRes = await client.query(`SELECT * FROM ventas WHERE id=$1 FOR UPDATE`, [id]);
    if (ventaRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Venta no encontrada' });
    }
    const venta = ventaRes.rows[0];
    if (venta.anulada) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Venta ya anulada' });
    }

    // Revertir stock por detalle_venta (solo productos)
    const detalles = await client.query(`SELECT producto_id, cantidad FROM detalle_venta WHERE venta_id=$1`, [id]);

    for (const dv of detalles.rows) {
      const prodId = dv.producto_id;
      const cantidad = parseFloat(dv.cantidad);
      await client.query(`UPDATE productos SET stock_total = stock_total + $1 WHERE id=$2`, [cantidad, prodId]);

      await registrarMovimiento({
        client,
        negocio_id: venta.negocio_id,
        local_id: venta.local_id,
        producto_id: prodId,
        cantidad,
        tipo: 'anulacion',
        motivo: `Anulacion venta ${id}`,
        usuario_id: usuario.id,
        referencia: { venta_id: id }
      });
    }

    // Marcar venta como anulada y poner total 0
    await client.query(`UPDATE ventas SET anulada = TRUE, total = 0 WHERE id=$1`, [id]);

    // Para cada pago asociado, registrar reembolso (retiro de caja) y marcar pago anulado
    const pagosRes = await client.query(`SELECT * FROM pagos_venta WHERE venta_id=$1`, [id]);
    for (const pago of pagosRes.rows) {
      if (!pago.anulada) {
        // Buscar turno abierto
        const turnoRes = await client.query(
          `SELECT id FROM turnos WHERE local_id=$1 AND estado='abierto' ORDER BY fecha_apertura DESC LIMIT 1`,
          [venta.local_id]
        );
        if (turnoRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'No hay turno abierto para registrar reembolso' });
        }
        const turno_id = turnoRes.rows[0].id;

        await client.query(
          `INSERT INTO retiros_caja (turno_id, usuario_id, negocio_id, local_id, monto, motivo) VALUES ($1, $2, $3, $4, $5, $6)`,
          [turno_id, usuario.id, venta.negocio_id, venta.local_id, pago.monto, `Reembolso por anulación de venta ${id}`]
        );

        await client.query(`UPDATE pagos_venta SET anulada = TRUE WHERE id=$1`, [pago.id]);
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Venta anulada, stock revertido y reembolsos registrados' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};