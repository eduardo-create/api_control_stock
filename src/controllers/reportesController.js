const db = require('../db');
const ExcelJS = require('exceljs');

// Stubs para rutas aún no implementadas
exports.getVentas = async (req, res) => res.status(501).json({ message: 'Reporte de ventas no implementado' });
// Reporte de stock y movimientos por producto/local
exports.getStock = async (req, res) => {
  const { local_id, formato, desde, hasta } = req.query;
  const usuario = req.usuario;

  const params = [usuario.negocio_id];
  const whereVenta = ['v.negocio_id = $1'];
  let idxLocalParam = null;
  const localCoalesceExpr = () => (idxLocalParam ? `COALESCE(v.local_id, $${idxLocalParam})` : 'v.local_id');
  const localMovExpr = () => (idxLocalParam ? `COALESCE(mp.local_id, $${idxLocalParam})` : 'mp.local_id');
  const whereMovClause = whereVenta.length ? `WHERE ${whereVenta.map(c => c.replace(/v\./g, 'mp.')).join(' AND ')}` : '';
  if (local_id) {
    params.push(Number(local_id));
    idxLocalParam = params.length;
    // Incluir ventas con local nulo, asignándolas al local filtrado
    whereVenta.push(`(v.local_id = $${idxLocalParam} OR v.local_id IS NULL)`);
  }
  if (desde) {
    params.push(`${desde} 00:00:00`);
    whereVenta.push(`v.fecha >= $${params.length}::timestamp`);
  }
  if (hasta) {
    params.push(`${hasta} 23:59:59`);
    whereVenta.push(`v.fecha <= $${params.length}::timestamp`);
  }

  const whereClause = whereVenta.length ? `WHERE ${whereVenta.join(' AND ')}` : '';

  try {
    const ventaResult = await db.query(
      `
        WITH ventas_resumen AS (
          SELECT
            dv.producto_id,
            ${localCoalesceExpr()} AS local_id,
            SUM(dv.cantidad) AS vendidos
          FROM ventas v
          JOIN detalle_venta dv ON dv.venta_id = v.id
          ${whereClause}
          GROUP BY dv.producto_id, ${localCoalesceExpr()}
        ),
        promo_resumen AS (
          SELECT
            vpi.producto_id,
            ${localCoalesceExpr()} AS local_id,
            SUM(vpi.cantidad) AS vendidos
          FROM ventas v
          JOIN venta_promociones vp ON vp.venta_id = v.id
          JOIN venta_promocion_items vpi ON vpi.venta_promocion_id = vp.id
          JOIN productos p ON p.id = vpi.producto_id
          ${whereClause}
          GROUP BY vpi.producto_id, ${localCoalesceExpr()}
        ),
        mov_resumen AS (
          SELECT
            mp.producto_id,
            ${localMovExpr()} AS local_id,
            SUM(CASE WHEN mp.cantidad >= 0 THEN mp.cantidad ELSE 0 END) AS entradas,
            SUM(CASE WHEN mp.cantidad < 0 THEN -mp.cantidad ELSE 0 END) AS salidas
          FROM movimientos_productos mp
          ${whereMovClause}
          GROUP BY mp.producto_id, ${localMovExpr()}
        ),
        total_resumen AS (
          SELECT producto_id, local_id,
                 SUM(vendidos) AS vendidos,
                 SUM(entradas) AS entradas,
                 SUM(salidas) AS salidas
          FROM (
            SELECT producto_id, local_id, vendidos, 0 AS entradas, 0 AS salidas FROM ventas_resumen
            UNION ALL
            SELECT producto_id, local_id, vendidos, 0 AS entradas, 0 AS salidas FROM promo_resumen
            UNION ALL
            SELECT producto_id, local_id, 0 AS vendidos, entradas, salidas FROM mov_resumen
          ) t
          GROUP BY producto_id, local_id
        )
        SELECT
          p.id AS producto_id,
          p.nombre AS producto,
          p.precio AS precio,
          vr.local_id AS local_id,
          COALESCE(l.nombre, 'Sin movimientos') AS local,
          COALESCE(p.stock_total, 0) AS stock_total,
          COALESCE(vr.entradas, 0) AS entradas,
          COALESCE(vr.salidas, 0) AS salidas,
          COALESCE(vr.vendidos, 0) AS vendidos
        FROM productos p
        LEFT JOIN total_resumen vr ON vr.producto_id = p.id
        LEFT JOIN locales l ON l.id = vr.local_id
        WHERE (p.activo IS NULL OR p.activo = TRUE)
          AND p.negocio_id = $1
        ORDER BY p.nombre, l.nombre
      `,
      params
    );
    let rows = ventaResult.rows || [];

    // Si se filtró por local y no hubo ventas, completar nombre/local_id para que no aparezca como "Sin movimientos"
    if (local_id) {
      const localInfo = await db.query(
        'SELECT nombre FROM locales WHERE id = $1 AND negocio_id = $2',
        [Number(local_id), usuario.negocio_id]
      );
      const localNombre = localInfo.rows[0]?.nombre || 'Local';
      rows = rows.map(r => ({
        ...r,
        local_id: r.local_id ?? Number(local_id),
        local: r.local ?? localNombre
      }));
    }

    if (formato === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Stock');

      worksheet.columns = [
        { header: 'Producto', key: 'producto', width: 30 },
        { header: 'Local', key: 'local', width: 20 },
        { header: 'Local ID', key: 'local_id', width: 10 },
        { header: 'Precio', key: 'precio', width: 12 },
        { header: 'Entradas', key: 'entradas', width: 12 },
        { header: 'Salidas', key: 'salidas', width: 12 },
        { header: 'Vendidos', key: 'vendidos', width: 12 },
        { header: 'Stock Total', key: 'stock_total', width: 12 }
      ];

      worksheet.addRows(rows);

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const fechaTag = new Date().toISOString().slice(0, 10);
      const sufLocal = local_id ? `local-${local_id}` : 'todos';
      res.setHeader('Content-Disposition', `attachment; filename="reporte_stock_${sufLocal}_${fechaTag}.xlsx"`);
      return res.send(buffer);
    }

    res.json(rows);
  } catch (error) {
    console.error('Error obteniendo reporte de stock:', error);
    res.status(500).json({ error: 'Error al obtener reporte de stock' });
  }
};
exports.getFinancieros = async (req, res) => res.status(501).json({ message: 'Reporte financiero no implementado' });
exports.getReporteTurnos = async (req, res) => res.status(501).json({ message: 'Reporte de turnos no implementado' });

// Ventas agrupadas por cliente
exports.getVentasPorCliente = async (req, res) => {
  try {
    const usuario = req.usuario;
    const { desde, hasta, cliente_id, local_id, formato } = req.query;

    const params = [usuario.negocio_id];
    const where = ['v.negocio_id = $1'];

    if (desde) {
      params.push(`${desde} 00:00:00`);
      where.push(`v.fecha >= $${params.length}::timestamp`);
    }
    if (hasta) {
      params.push(`${hasta} 23:59:59`);
      where.push(`v.fecha <= $${params.length}::timestamp`);
    }
    if (cliente_id) {
      params.push(Number(cliente_id));
      where.push(`v.cliente_id = $${params.length}`);
    }
    if (local_id) {
      params.push(Number(local_id));
      where.push(`(v.local_id = $${params.length} OR v.local_id IS NULL)`);
    }

    const sql = `
      SELECT
        COALESCE(c.id, 0) AS cliente_id,
        COALESCE(c.nombre, 'Sin cliente') AS cliente_nombre,
        COALESCE(c.email, '') AS email,
        COUNT(*) AS cantidad_ventas,
        SUM(v.total) AS total_bruto,
        SUM(COALESCE(v.total_descuento, 0)) AS total_descuento,
        SUM(v.total - COALESCE(v.total_descuento, 0)) AS total_neto,
        MIN(v.fecha) AS primera_venta,
        MAX(v.fecha) AS ultima_venta
      FROM ventas v
      LEFT JOIN clientes c ON c.id = v.cliente_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY COALESCE(c.id, 0), COALESCE(c.nombre, 'Sin cliente'), COALESCE(c.email, '')
      ORDER BY total_neto DESC
    `;

    const result = await db.query(sql, params);
    const rows = result.rows || [];

    if (formato === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Ventas por cliente');
      sheet.columns = [
        { header: 'Cliente', key: 'cliente_nombre', width: 30 },
        { header: 'Cliente ID', key: 'cliente_id', width: 10 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Ventas', key: 'cantidad_ventas', width: 10 },
        { header: 'Total bruto', key: 'total_bruto', width: 14 },
        { header: 'Descuentos', key: 'total_descuento', width: 14 },
        { header: 'Total neto', key: 'total_neto', width: 14 },
        { header: 'Primera venta', key: 'primera_venta', width: 20 },
        { header: 'Última venta', key: 'ultima_venta', width: 20 }
      ];
      sheet.addRows(rows.map(r => ({
        ...r,
        primera_venta: r.primera_venta ? new Date(r.primera_venta).toISOString().replace('T', ' ').slice(0, 19) : '',
        ultima_venta: r.ultima_venta ? new Date(r.ultima_venta).toISOString().replace('T', ' ').slice(0, 19) : ''
      })));

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const fechaTag = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Disposition', `attachment; filename="ventas_por_cliente_${fechaTag}.xlsx"`);
      return res.send(buffer);
    }

    res.json(rows);
  } catch (err) {
    console.error('Error en reporte ventas por cliente:', err);
    res.status(500).json({ error: err.message });
  }
};

// Producto más comprado por cliente
exports.getProductosPorCliente = async (req, res) => {
  try {
    const usuario = req.usuario;
    const { desde, hasta, cliente_id, local_id, formato } = req.query;

    const params = [usuario.negocio_id];
    const where = ['v.negocio_id = $1'];

    if (desde) {
      params.push(`${desde} 00:00:00`);
      where.push(`v.fecha >= $${params.length}::timestamp`);
    }
    if (hasta) {
      params.push(`${hasta} 23:59:59`);
      where.push(`v.fecha <= $${params.length}::timestamp`);
    }
    if (cliente_id) {
      params.push(Number(cliente_id));
      where.push(`v.cliente_id = $${params.length}`);
    }
    if (local_id) {
      params.push(Number(local_id));
      where.push(`(v.local_id = $${params.length} OR v.local_id IS NULL)`);
    }

    const sql = `
      WITH ventas_filtradas AS (
        SELECT v.id, v.cliente_id
        FROM ventas v
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ),
      detalle_total AS (
        SELECT vf.cliente_id, dv.producto_id, SUM(dv.cantidad) AS qty
        FROM ventas_filtradas vf
        JOIN detalle_venta dv ON dv.venta_id = vf.id
        GROUP BY vf.cliente_id, dv.producto_id
        UNION ALL
        SELECT vf.cliente_id, vpi.producto_id, SUM(vpi.cantidad) AS qty
        FROM ventas_filtradas vf
        JOIN venta_promociones vp ON vp.venta_id = vf.id
        JOIN venta_promocion_items vpi ON vpi.venta_promocion_id = vp.id
        GROUP BY vf.cliente_id, vpi.producto_id
      ),
      detalle_agregado AS (
        SELECT cliente_id, producto_id, SUM(qty) AS qty
        FROM detalle_total
        GROUP BY cliente_id, producto_id
      ),
      ranked AS (
        SELECT da.*, ROW_NUMBER() OVER (PARTITION BY da.cliente_id ORDER BY da.qty DESC) AS rn
        FROM detalle_agregado da
      )
      SELECT
        COALESCE(c.id, 0) AS cliente_id,
        COALESCE(c.nombre, 'Sin cliente') AS cliente_nombre,
        COALESCE(c.email, '') AS email,
        COALESCE(p.id, 0) AS producto_id,
        COALESCE(p.nombre, 'Sin producto') AS producto_nombre,
        COALESCE(r.qty, 0) AS cantidad
      FROM ranked r
      LEFT JOIN clientes c ON c.id = r.cliente_id
      LEFT JOIN productos p ON p.id = r.producto_id
      WHERE r.rn = 1
      ORDER BY cliente_nombre
    `;

    const result = await db.query(sql, params);
    const rows = result.rows || [];

    if (formato === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Productos por cliente');
      sheet.columns = [
        { header: 'Cliente', key: 'cliente_nombre', width: 30 },
        { header: 'Cliente ID', key: 'cliente_id', width: 12 },
        { header: 'Email', key: 'email', width: 28 },
        { header: 'Producto', key: 'producto_nombre', width: 30 },
        { header: 'Producto ID', key: 'producto_id', width: 12 },
        { header: 'Cantidad', key: 'cantidad', width: 12 }
      ];
      sheet.addRows(rows);

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const fechaTag = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Disposition', `attachment; filename="productos_por_cliente_${fechaTag}.xlsx"`);
      return res.send(buffer);
    }

    res.json(rows);
  } catch (err) {
    console.error('Error en reporte productos por cliente:', err);
    res.status(500).json({ error: err.message });
  }
};

// Promociones más vendidas (sin detalle de productos)
exports.getPromosMasVendidas = async (req, res) => {
  try {
    const usuario = req.usuario;
    const { desde, hasta, local_id, formato } = req.query;

    const params = [usuario.negocio_id];
    const where = ['v.negocio_id = $1'];

    if (desde) {
      params.push(`${desde} 00:00:00`);
      where.push(`v.fecha >= $${params.length}::timestamp`);
    }
    if (hasta) {
      params.push(`${hasta} 23:59:59`);
      where.push(`v.fecha <= $${params.length}::timestamp`);
    }
    if (local_id) {
      params.push(Number(local_id));
      where.push(`(v.local_id = $${params.length} OR v.local_id IS NULL)`);
    }

    const sql = `
      WITH ventas_filtradas AS (
        SELECT v.id
        FROM ventas v
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      )
      SELECT
        vp.promocion_id,
        COALESCE(p.nombre, CONCAT('Promo ', vp.promocion_id)) AS promocion,
        SUM(vp.cantidad) AS cantidad_total,
        SUM(vp.subtotal) AS total_bruto,
        COUNT(DISTINCT vp.venta_id) AS tickets
      FROM ventas_filtradas vf
      JOIN venta_promociones vp ON vp.venta_id = vf.id
      LEFT JOIN promociones p ON p.id = vp.promocion_id
      GROUP BY vp.promocion_id, COALESCE(p.nombre, CONCAT('Promo ', vp.promocion_id))
      ORDER BY cantidad_total DESC
    `;

    const result = await db.query(sql, params);
    const rows = result.rows || [];

    if (formato === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Promos más vendidas');
      sheet.columns = [
        { header: 'Promoción', key: 'promocion', width: 30 },
        { header: 'Promoción ID', key: 'promocion_id', width: 14 },
        { header: 'Cantidad vendida', key: 'cantidad_total', width: 16 },
        { header: 'Tickets', key: 'tickets', width: 12 },
        { header: 'Total bruto', key: 'total_bruto', width: 14 },
      ];
      sheet.addRows(rows);

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const fechaTag = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Disposition', `attachment; filename="promos_mas_vendidas_${fechaTag}.xlsx"`);
      return res.send(buffer);
    }

    res.json(rows);
  } catch (err) {
    console.error('Error en reporte promos más vendidas:', err);
    res.status(500).json({ error: err.message });
  }
};

// Clientes que compraron más promociones (con su promo más frecuente)
exports.getClientesPromos = async (req, res) => {
  try {
    const usuario = req.usuario;
    const { desde, hasta, local_id, formato } = req.query;

    const params = [usuario.negocio_id];
    const where = ['v.negocio_id = $1'];

    if (desde) {
      params.push(`${desde} 00:00:00`);
      where.push(`v.fecha >= $${params.length}::timestamp`);
    }
    if (hasta) {
      params.push(`${hasta} 23:59:59`);
      where.push(`v.fecha <= $${params.length}::timestamp`);
    }
    if (local_id) {
      params.push(Number(local_id));
      where.push(`(v.local_id = $${params.length} OR v.local_id IS NULL)`);
    }

    const sql = `
      WITH ventas_filtradas AS (
        SELECT v.id, v.cliente_id
        FROM ventas v
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ),
      promos AS (
        SELECT vf.cliente_id, vp.promocion_id, vp.cantidad, vp.subtotal
        FROM ventas_filtradas vf
        JOIN venta_promociones vp ON vp.venta_id = vf.id
      ),
      agg AS (
        SELECT cliente_id, SUM(cantidad) AS total_promos, SUM(subtotal) AS total_bruto
        FROM promos
        GROUP BY cliente_id
      ),
      fav AS (
        SELECT cliente_id, promocion_id, SUM(cantidad) AS qty,
               ROW_NUMBER() OVER (PARTITION BY cliente_id ORDER BY SUM(cantidad) DESC) AS rn
        FROM promos
        GROUP BY cliente_id, promocion_id
      )
      SELECT
        COALESCE(c.id, 0) AS cliente_id,
        COALESCE(c.nombre, 'Sin cliente') AS cliente_nombre,
        COALESCE(c.email, '') AS email,
        COALESCE(a.total_promos, 0) AS total_promos,
        COALESCE(a.total_bruto, 0) AS total_bruto,
        COALESCE(p.id, 0) AS promocion_id,
        COALESCE(p.nombre, 'Promo') AS promocion_nombre,
        COALESCE(f.qty, 0) AS promocion_cantidad
      FROM agg a
      LEFT JOIN fav f ON f.cliente_id = a.cliente_id AND f.rn = 1
      LEFT JOIN clientes c ON c.id = a.cliente_id
      LEFT JOIN promociones p ON p.id = f.promocion_id
      ORDER BY total_promos DESC
    `;

    const result = await db.query(sql, params);
    const rows = result.rows || [];

    if (formato === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Clientes con promos');
      sheet.columns = [
        { header: 'Cliente', key: 'cliente_nombre', width: 28 },
        { header: 'Cliente ID', key: 'cliente_id', width: 12 },
        { header: 'Email', key: 'email', width: 26 },
        { header: 'Total promos', key: 'total_promos', width: 14 },
        { header: 'Total bruto', key: 'total_bruto', width: 14 },
        { header: 'Promo favorita', key: 'promocion_nombre', width: 28 },
        { header: 'Promo favorita ID', key: 'promocion_id', width: 14 },
        { header: 'Cantidad promo fav', key: 'promocion_cantidad', width: 16 },
      ];
      sheet.addRows(rows);

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const fechaTag = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Disposition', `attachment; filename="clientes_promos_${fechaTag}.xlsx"`);
      return res.send(buffer);
    }

    res.json(rows);
  } catch (err) {
    console.error('Error en reporte clientes con promos:', err);
    res.status(500).json({ error: err.message });
  }
};
// Ajustes manuales de stock (movimientos_productos tipo ajuste)
exports.getAjustesStock = async (req, res) => {
  try {
    const usuario = req.usuario;
    const { desde, hasta, local_id, producto_id, formato } = req.query;

    const params = [usuario.negocio_id];
    const where = ['mp.negocio_id = $1', "mp.tipo ILIKE 'ajuste%' "];

    if (local_id) {
      params.push(Number(local_id));
      where.push(`COALESCE(mp.local_id, 0) = $${params.length}`);
    }

    if (producto_id) {
      params.push(Number(producto_id));
      where.push(`mp.producto_id = $${params.length}`);
    }

    if (desde) {
      params.push(`${desde} 00:00:00`);
      where.push(`mp.fecha >= $${params.length}::timestamp`);
    }
    if (hasta) {
      params.push(`${hasta} 23:59:59`);
      where.push(`mp.fecha <= $${params.length}::timestamp`);
    }

    const query = `
      SELECT
        mp.id,
        mp.fecha,
        mp.tipo,
        mp.cantidad,
        mp.motivo,
        (mp.referencia->>'stock_prev')::numeric AS stock_prev,
        (mp.referencia->>'stock_nuevo')::numeric AS stock_nuevo,
        mp.local_id,
        COALESCE(l.nombre, 'Sin local') AS local,
        mp.producto_id,
        p.nombre AS producto,
        u.nombre AS usuario
      FROM movimientos_productos mp
      LEFT JOIN locales l ON l.id = mp.local_id
      JOIN productos p ON p.id = mp.producto_id
      LEFT JOIN usuarios u ON u.id = mp.usuario_id
      WHERE ${where.join(' AND ')}
      ORDER BY mp.fecha DESC
    `;

    const result = await db.query(query, params);
    const rows = result.rows || [];

    if (formato === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Ajustes de stock');
      sheet.columns = [
        { header: 'Fecha', key: 'fecha', width: 20 },
        { header: 'Local', key: 'local', width: 20 },
        { header: 'Producto', key: 'producto', width: 30 },
        { header: 'Cantidad', key: 'cantidad', width: 12 },
        { header: 'Stock previo', key: 'stock_prev', width: 14 },
        { header: 'Stock nuevo', key: 'stock_nuevo', width: 14 },
        { header: 'Tipo', key: 'tipo', width: 14 },
        { header: 'Motivo', key: 'motivo', width: 30 },
        { header: 'Usuario', key: 'usuario', width: 20 }
      ];
      sheet.addRows(rows.map(r => ({
        ...r,
        fecha: r.fecha ? new Date(r.fecha).toISOString().replace('T', ' ').slice(0, 19) : ''
      })));

      const buffer = await workbook.xlsx.writeBuffer();
      const fechaTag = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="ajustes_stock_${fechaTag}.xlsx"`);
      return res.send(buffer);
    }

    res.json(rows);
  } catch (err) {
    console.error('Error en reporte ajustes stock:', err);
    res.status(500).json({ error: err.message });
  }
};

// Ventas por período (día/mes/año) con export a Excel
exports.getVentasPeriodo = async (req, res) => {
  try {
    const usuario = req.usuario;
    const { desde, hasta, local_id, turno_id, turno, agrupar } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({ message: "Debes indicar 'desde' y 'hasta' en formato YYYY-MM-DD" });
    }

    const fechaDesde = `${desde} 00:00:00`;
    const fechaHasta = `${hasta} 23:59:59`;
    let groupExpr = "DATE(v.fecha)";
    let labelFormatter = (d) => d?.toISOString?.().slice(0, 10) || d;

    if (agrupar === 'mes') {
      groupExpr = "DATE_TRUNC('month', v.fecha)";
      labelFormatter = (d) => {
        const dt = new Date(d);
        if (Number.isNaN(dt.getTime())) return '—';
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        return `${dt.getFullYear()}-${mm}`;
      };
    } else if (agrupar === 'anio') {
      groupExpr = "DATE_TRUNC('year', v.fecha)";
      labelFormatter = (d) => {
        const dt = new Date(d);
        if (Number.isNaN(dt.getTime())) return '—';
        return `${dt.getFullYear()}`;
      };
    }

    const params = [usuario.negocio_id, fechaDesde, fechaHasta];
    const where = [`v.negocio_id = $1`, `v.fecha BETWEEN $2::timestamp AND $3::timestamp`];
    let turnoLabel = null;
    let joinTurno = '';
    if (local_id) {
      params.push(Number(local_id));
      where.push(`v.local_id = $${params.length}`);
    }

    if (turno_id) {
      params.push(Number(turno_id));
      where.push(`v.turno_id = $${params.length}`);
      joinTurno = 'JOIN turnos t ON t.id = v.turno_id';
      const turnoRow = await db.query(
        `SELECT descripcion FROM turnos WHERE id = $1 AND negocio_id = $2`,
        [Number(turno_id), usuario.negocio_id]
      );
      turnoLabel = turnoRow.rows[0]?.descripcion || null;
    } else if (turno) {
      joinTurno = 'JOIN turnos t ON t.id = v.turno_id';
      params.push(turno);
      where.push(`t.descripcion ILIKE $${params.length}`);
      turnoLabel = turno;
    }

    const ventasPorPeriodo = await db.query(
      `SELECT ${groupExpr} AS periodo, SUM(v.total) AS total_ventas, COUNT(*) AS tickets
       FROM ventas v
       ${joinTurno}
       WHERE ${where.join(' AND ')}
       GROUP BY ${groupExpr}
       ORDER BY ${groupExpr} DESC`,
      params
    );

    const pagosPorMetodo = await db.query(
      `SELECT ${groupExpr} AS periodo, mp.nombre AS metodo, SUM(pv.monto) AS total
       FROM pagos_venta pv
       JOIN ventas v ON v.id = pv.venta_id
       JOIN metodos_pago mp ON mp.id = pv.metodo_id
       ${joinTurno}
       WHERE ${where.join(' AND ')}
       GROUP BY ${groupExpr}, mp.nombre
       ORDER BY ${groupExpr} DESC`,
      params
    );

    const pagosMap = new Map();
    pagosPorMetodo.rows.forEach(r => {
      const key = (r.periodo instanceof Date) ? r.periodo.toISOString() : String(r.periodo);
      if (!pagosMap.has(key)) pagosMap.set(key, {});
      pagosMap.get(key)[r.metodo] = parseFloat(r.total) || 0;
    });

    const rows = ventasPorPeriodo.rows.map(r => {
      const key = (r.periodo instanceof Date) ? r.periodo.toISOString() : String(r.periodo);
      const metodos = pagosMap.get(key) || {};
      const total = parseFloat(r.total_ventas || 0);
      const tickets = parseInt(r.tickets || 0, 10);
      return {
        periodo: labelFormatter(r.periodo),
        turno_id: turno_id ? Number(turno_id) : null,
        turno: turnoLabel || (turno_id ? `Turno ${turno_id}` : null),
        total_ventas: total,
        tickets,
        ticket_promedio: tickets > 0 ? total / tickets : 0,
        pagos_por_metodo: metodos
      };
    });

    if (req.query.formato === 'json') {
      return res.json(rows);
    }

    const workbook = new ExcelJS.Workbook();
    const resumen = workbook.addWorksheet('Resumen');
    const totalVentas = rows.reduce((acc, r) => acc + r.total_ventas, 0);
    const totalTickets = rows.reduce((acc, r) => acc + r.tickets, 0);
    resumen.addRow(['Total ventas', totalVentas]);
    resumen.addRow(['Total tickets', totalTickets]);
    resumen.addRow(['Ticket promedio', totalTickets > 0 ? totalVentas / totalTickets : 0]);

    const detalle = workbook.addWorksheet('Detalle');
    const metodosSet = new Set();
    rows.forEach(r => Object.keys(r.pagos_por_metodo || {}).forEach(m => metodosSet.add(m)));
    const metodoList = Array.from(metodosSet);

    detalle.addRow(['Periodo', 'Turno', 'Tickets', 'Total ventas', 'Ticket promedio', ...metodoList.map(m => `Pago ${m}`)]);
    rows.forEach(r => {
      detalle.addRow([
        r.periodo,
        r.turno || r.turno_id || '',
        r.tickets,
        r.total_ventas,
        r.ticket_promedio,
        ...metodoList.map(m => (r.pagos_por_metodo || {})[m] || 0)
      ]);
    });

    const suf = `${desde || 'inicio'}_a_${hasta || 'fin'}`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=ventas_periodo_${suf}.xlsx`);
    await workbook.xlsx.write(res);
    return res.end();
  } catch (err) {
    console.error('Error en reporte ventas periodo:', err);
    res.status(500).json({ error: err.message });
  }
};

// Cierre diario/mensual con desgloses
exports.getCierre = async (req, res) => {
  try {
    const usuario = req.usuario;
    const { desde, hasta, turno_id, local_id, agrupar } = req.query;

    const params = [usuario.negocio_id];
    const filters = ['t.negocio_id = $1'];

    if (turno_id) {
      params.push(Number(turno_id));
      filters.push(`t.id = $${params.length}`);
    } else {
      if (desde) {
        params.push(`${desde} 00:00:00`);
        filters.push(`t.fecha_apertura >= $${params.length}`);
      }
      if (hasta) {
        params.push(`${hasta} 23:59:59`);
        filters.push(`t.fecha_apertura <= $${params.length}`);
      }
    }

    if (local_id) {
      params.push(Number(local_id));
      filters.push(`t.local_id = $${params.length}`);
    }

    const turnosResult = await db.query(
      `SELECT t.id, t.local_id, t.usuario_id, t.fecha_apertura, t.fecha_cierre, t.saldo_inicial, t.saldo_final, t.descripcion, u.nombre AS usuario_nombre
       FROM turnos t
       LEFT JOIN usuarios u ON u.id = t.usuario_id
       WHERE ${filters.join(' AND ')}
       ORDER BY t.fecha_apertura DESC`,
      params
    );

    const turnos = turnosResult.rows;
    if (turnos.length === 0) {
      return res.json([]);
    }

    const rows = [];

    for (const t of turnos) {
      // Ventas y pedidos del turno
      const ventasAgg = await db.query(
        `SELECT COALESCE(SUM(v.total),0) AS total_ventas, COUNT(*) AS pedidos
         FROM ventas v
         WHERE v.turno_id = $1 AND v.negocio_id = $2`,
        [t.id, usuario.negocio_id]
      );

      const pagosMetodos = await db.query(
        `SELECT mp.nombre AS metodo, COALESCE(SUM(pv.monto),0) AS total
         FROM pagos_venta pv
         JOIN metodos_pago mp ON mp.id = pv.metodo_id
         JOIN ventas v ON v.id = pv.venta_id
         WHERE v.turno_id = $1 AND pv.negocio_id = $2
         GROUP BY mp.nombre`,
        [t.id, usuario.negocio_id]
      );

      const pagosPorMetodo = {};
      let totalIngresos = 0;
      for (const p of pagosMetodos.rows) {
        const val = parseFloat(p.total) || 0;
        pagosPorMetodo[p.metodo] = val;
        totalIngresos += val;
      }

      // Retiros de caja (egresos) del turno
      const retirosAgg = await db.query(
        `SELECT COALESCE(SUM(monto),0) AS total
         FROM retiros_caja
         WHERE turno_id = $1 AND negocio_id = $2`,
        [t.id, usuario.negocio_id]
      );
      const totalRetiros = parseFloat(retirosAgg.rows[0]?.total || 0);

      // Movimientos de caja tipo gasto/devolucion
      const movsAgg = await db.query(
        `SELECT tipo, COALESCE(SUM(monto),0) AS total
         FROM movimientos_caja
         WHERE turno_id = $1 AND usuario_id IS NOT NULL
         GROUP BY tipo`,
        [t.id]
      );

      let totalGastos = totalRetiros;
      for (const m of movsAgg.rows) {
        const tipo = (m.tipo || '').toUpperCase();
        const val = parseFloat(m.total) || 0;
        if (tipo === 'GASTO' || tipo === 'DEVOLUCION' || tipo === 'DEVOLUCIÓN') {
          totalGastos += val;
        }
      }

      const sueldos = 0; // sin fuente aún
      const totalEgresos = totalGastos + sueldos;
      const inicioCaja = parseFloat(t.saldo_inicial || 0);
      const cierreReal = t.saldo_final !== null && t.saldo_final !== undefined ? parseFloat(t.saldo_final) : null;
      const cierreTeorico = inicioCaja + totalIngresos - totalEgresos;
      const diferencia = cierreReal !== null ? (cierreReal - cierreTeorico) : null;

      rows.push({
        turno_id: t.id,
        turno_nombre: t.descripcion || (t.id ? `Turno ${t.id}` : null),
        fecha: t.fecha_apertura,
        hora: t.fecha_apertura,
        total_pedidos: parseInt(ventasAgg.rows[0]?.pedidos || 0, 10),
        inicio_caja: inicioCaja,
        total_ventas: parseFloat(ventasAgg.rows[0]?.total_ventas || 0),
        pagos_por_metodo: pagosPorMetodo,
        total_gastos: totalGastos,
        sueldos,
        neto_dia: totalIngresos - totalEgresos,
        total_ingresos: totalIngresos,
        total_egresos: totalEgresos,
        cierre_teorico: cierreTeorico,
        cierre_real: cierreReal,
        diferencia,
        fecha_cierre: t.fecha_cierre,
        hora_cierre: t.fecha_cierre,
        usuario_cierre: t.usuario_nombre || t.usuario_id || null,
        empleado: null,
        local_id: t.local_id
      });
    }

    if (agrupar === 'dia') {
      const byDay = new Map();
      for (const r of rows) {
        const day = (r.fecha ? new Date(r.fecha).toISOString().slice(0, 10) : '');
        if (!byDay.has(day)) {
          byDay.set(day, {
            fecha: day,
            hora: null,
            turno_ids: [],
            turno_nombres: [],
            total_pedidos: 0,
            inicio_caja: 0,
            total_ventas: 0,
            pagos_por_metodo: {},
            total_gastos: 0,
            sueldos: 0,
            total_ingresos: 0,
            total_egresos: 0,
            cierre_real: 0,
            fecha_cierre: null,
            hora_cierre: null
          });
        }
        const acc = byDay.get(day);
        acc.turno_ids.push(r.turno_id);
        if (r.turno_nombre) acc.turno_nombres.push(r.turno_nombre);
        acc.total_pedidos += r.total_pedidos;
        acc.inicio_caja += r.inicio_caja;
        acc.total_ventas += r.total_ventas;
        acc.total_gastos += r.total_gastos;
        acc.sueldos += r.sueldos;
        acc.total_ingresos += r.total_ingresos;
        acc.total_egresos += r.total_egresos;
        if (r.cierre_real !== null && r.cierre_real !== undefined) acc.cierre_real += r.cierre_real;
        acc.fecha_cierre = r.fecha_cierre || acc.fecha_cierre;
        acc.hora_cierre = r.hora_cierre || acc.hora_cierre;
        for (const [k, v] of Object.entries(r.pagos_por_metodo || {})) {
          acc.pagos_por_metodo[k] = (acc.pagos_por_metodo[k] || 0) + v;
        }
      }

      const aggregated = Array.from(byDay.values()).map(d => {
        const cierre_teorico = d.inicio_caja + d.total_ingresos - d.total_egresos;
        const diferencia = d.cierre_real !== null && d.cierre_real !== undefined ? d.cierre_real - cierre_teorico : null;
        return {
          fecha: d.fecha,
          hora: d.hora,
          turno_id: null,
          turno_nombre: d.turno_nombres.length ? d.turno_nombres.join(', ') : null,
          total_pedidos: d.total_pedidos,
          inicio_caja: d.inicio_caja,
          total_ventas: d.total_ventas,
          pagos_por_metodo: d.pagos_por_metodo,
          total_gastos: d.total_gastos,
          sueldos: d.sueldos,
          neto_dia: d.total_ingresos - d.total_egresos,
          total_ingresos: d.total_ingresos,
          total_egresos: d.total_egresos,
          cierre_teorico,
          cierre_real: d.cierre_real,
          diferencia,
          fecha_cierre: d.fecha_cierre,
          hora_cierre: d.hora_cierre,
          usuario_cierre: null,
          empleado: null,
          turnos: d.turno_ids
        };
      });

      const data = aggregated;
      if (req.query.formato === 'excel') {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Cierre');

        const metodosCols = new Set();
        data.forEach(r => Object.keys(r.pagos_por_metodo || {}).forEach(m => metodosCols.add(m)));
        const metodoList = Array.from(metodosCols);

        sheet.addRow([
          'Fecha','Hora','Turno','Pedidos','Inicio caja','Total ventas',
          ...metodoList.map(m => `Pago ${m}`),
          'Gastos','Sueldos','Neto día','Ingresos','Egresos','Cierre teórico','Cierre real','Diferencia','F. cierre','H. cierre','Usuario cierre'
        ]);

        data.forEach(r => {
          sheet.addRow([
            r.fecha,
            r.hora,
            r.turno_nombre || r.turno_id || '',
            r.total_pedidos,
            r.inicio_caja,
            r.total_ventas,
            ...metodoList.map(m => (r.pagos_por_metodo || {})[m] || 0),
            r.total_gastos,
            r.sueldos,
            r.neto_dia,
            r.total_ingresos,
            r.total_egresos,
            r.cierre_teorico,
            r.cierre_real ?? '',
            r.diferencia ?? '',
            r.fecha_cierre || '',
            r.hora_cierre || '',
            r.usuario_cierre || ''
          ]);
        });

        const suf = `${req.query.desde || 'inicio'}_a_${req.query.hasta || 'fin'}`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=reporte_cierre_${suf}.xlsx`);
        await workbook.xlsx.write(res);
        return res.end();
      }

      return res.json(data);
    }
    const data = rows;

    if (req.query.formato === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Cierre');

      const metodosCols = new Set();
      data.forEach(r => Object.keys(r.pagos_por_metodo || {}).forEach(m => metodosCols.add(m)));
      const metodoList = Array.from(metodosCols);

      sheet.addRow([
        'Fecha','Hora','Turno','Pedidos','Inicio caja','Total ventas',
        ...metodoList.map(m => `Pago ${m}`),
        'Gastos','Sueldos','Neto día','Ingresos','Egresos','Cierre teórico','Cierre real','Diferencia','F. cierre','H. cierre','Usuario cierre'
      ]);

      data.forEach(r => {
        sheet.addRow([
          r.fecha,
          r.hora,
          r.turno_nombre || r.turno_id || '',
          r.total_pedidos,
          r.inicio_caja,
          r.total_ventas,
          ...metodoList.map(m => (r.pagos_por_metodo || {})[m] || 0),
          r.total_gastos,
          r.sueldos,
          r.neto_dia,
          r.total_ingresos,
          r.total_egresos,
          r.cierre_teorico,
          r.cierre_real ?? '',
          r.diferencia ?? '',
          r.fecha_cierre || '',
          r.hora_cierre || '',
          r.usuario_cierre || ''
        ]);
      });

      const suf = `${req.query.desde || 'inicio'}_a_${req.query.hasta || 'fin'}`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=reporte_cierre_${suf}.xlsx`);
      await workbook.xlsx.write(res);
      return res.end();
    }

    res.json(data);
  } catch (err) {
    console.error('Error en reporte cierre:', err);
    res.status(500).json({ error: err.message });
  }
};


exports.getCajaPorTurno = async (req, res) => {
  try {
    const { turno_id } = req.params;
    const usuario = req.usuario;

    // Buscar turno
    const turnoResult = await db.query(
      `SELECT t.id, t.fecha_apertura, t.fecha_cierre, t.saldo_inicial, t.saldo_final, t.descripcion, l.nombre AS local
       FROM turnos t
       JOIN locales l ON t.local_id = l.id
       WHERE t.id=$1 AND t.negocio_id=$2`,
      [turno_id, usuario.negocio_id]
    );

    if (turnoResult.rows.length === 0) {
      return res.status(404).json({ message: "Turno no encontrado" });
    }

    const turno = turnoResult.rows[0];

    // Ventas del turno
    const ventasResult = await db.query(
      `SELECT v.id, v.fecha, v.total, u.nombre AS vendedor
       FROM ventas v
       JOIN usuarios u ON v.usuario_id = u.id
       WHERE v.turno_id=$1
       ORDER BY v.fecha ASC`,
      [turno_id]
    );

    const totalVentas = ventasResult.rows.reduce((acc, v) => acc + parseFloat(v.total), 0);

    // Pagos por método
    const pagosResult = await db.query(
      `SELECT mp.nombre AS metodo, SUM(pv.monto) AS total
       FROM pagos_venta pv
       JOIN metodos_pago mp ON pv.metodo_id = mp.id
       JOIN ventas v ON pv.venta_id = v.id
       WHERE v.turno_id=$1
       GROUP BY mp.nombre`,
      [turno_id]
    );

    // Retiros de caja
    const retirosResult = await db.query(
      `SELECT r.id, r.fecha, r.monto, r.motivo, u.nombre AS usuario
       FROM retiros_caja r
       JOIN usuarios u ON r.usuario_id = u.id
       WHERE r.turno_id=$1
       ORDER BY r.fecha ASC`,
      [turno_id]
    );

    const totalRetiros = retirosResult.rows.reduce((acc, r) => acc + parseFloat(r.monto), 0);

    // Cantidad de ventas (tickets) del turno
    const totalComandas = ventasResult.rows.length;

    res.json({
      turno: {
        id: turno.id,
        descripcion: turno.descripcion,
        local: turno.local,
        fecha_apertura: turno.fecha_apertura,
        fecha_cierre: turno.fecha_cierre,
        saldo_inicial: turno.saldo_inicial,
        saldo_final: turno.saldo_final
      },
      resumen: {
        total_comandas: totalComandas,
        total_ventas: totalVentas,
        total_retiros: totalRetiros,
        balance: (totalVentas - totalRetiros),
        promedio_por_comanda: totalComandas > 0 ? (totalVentas / totalComandas) : 0
      },
      ventas: ventasResult.rows,
      pagos: pagosResult.rows,
      retiros: retirosResult.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// Reporte de caja por fechas
// Reporte de caja por rango de fechas
exports.getCajaPorFechas = async (req, res) => {
  try {
    const { desde, hasta, formato } = req.query;
    const usuario = req.usuario;

    if (!desde || !hasta) {
      return res.status(400).json({ message: "Debes indicar 'desde' y 'hasta' en formato YYYY-MM-DD" });
    }

    // Buscar turnos en el rango
    const turnosResult = await db.query(
      `SELECT t.id, t.fecha_apertura, t.fecha_cierre, t.saldo_inicial, t.saldo_final, t.descripcion, l.nombre AS local
       FROM turnos t
       JOIN locales l ON t.local_id = l.id
       WHERE t.negocio_id=$1 AND t.fecha_apertura BETWEEN $2::timestamp AND $3::timestamp
       ORDER BY t.fecha_apertura ASC`,
      [usuario.negocio_id, `${desde} 00:00:00`, `${hasta} 23:59:59`]
    );

    if (turnosResult.rows.length === 0) {
      return res.status(404).json({ message: "No se encontraron turnos en el rango indicado" });
    }

    const data = [];
    for (const turno of turnosResult.rows) {
      const ventasResult = await db.query(
        `SELECT v.id, v.fecha, v.total, u.nombre AS vendedor
         FROM ventas v
         JOIN usuarios u ON v.usuario_id = u.id
         WHERE v.turno_id=$1
         ORDER BY v.fecha ASC`,
        [turno.id]
      );

      const totalVentas = ventasResult.rows.reduce((acc, v) => acc + parseFloat(v.total), 0);

      const pagosResult = await db.query(
        `SELECT mp.nombre AS metodo, SUM(pv.monto) AS total
         FROM pagos_venta pv
         JOIN metodos_pago mp ON pv.metodo_id = mp.id
         JOIN ventas v ON pv.venta_id = v.id
         WHERE v.turno_id=$1
         GROUP BY mp.nombre`,
        [turno.id]
      );

      const retirosResult = await db.query(
        `SELECT r.id, r.fecha, r.monto, r.motivo, u.nombre AS usuario
         FROM retiros_caja r
         JOIN usuarios u ON r.usuario_id = u.id
         WHERE r.turno_id=$1
         ORDER BY r.fecha ASC`,
        [turno.id]
      );

      const totalRetiros = retirosResult.rows.reduce((acc, r) => acc + parseFloat(r.monto), 0);

      // Cantidad de ventas (tickets) del turno
      const totalComandas = ventasResult.rows.length;

      data.push({
        turno: {
          id: turno.id,
          descripcion: turno.descripcion,
          local: turno.local,
          fecha_apertura: turno.fecha_apertura,
          fecha_cierre: turno.fecha_cierre,
          saldo_inicial: turno.saldo_inicial,
          saldo_final: turno.saldo_final
        },
        resumen: {
          total_comandas: totalComandas,
          total_ventas: totalVentas,
          total_retiros: totalRetiros,
          balance: (totalVentas - totalRetiros),
          promedio_por_comanda: totalComandas > 0 ? (totalVentas / totalComandas) : 0
        },
        ventas: ventasResult.rows,
        pagos: pagosResult.rows,
        retiros: retirosResult.rows
      });
    }

    // Exportar a Excel si se pide
    if (formato === 'excel') {
      const workbook = new ExcelJS.Workbook();

      // Hoja resumen única con todos los turnos
      const resumenSheet = workbook.addWorksheet('Turnos');
      resumenSheet.addRow(['Turno', 'Local', 'Fecha apertura', 'Fecha cierre', 'Saldo inicial', 'Saldo final', 'Total ventas', 'Total retiros', 'Balance', 'Prom. por comanda']);
      data.forEach(reporte => {
        const nombreTurno = reporte.turno.descripcion || (reporte.turno.id ? `Turno ${reporte.turno.id}` : 'Turno');
        resumenSheet.addRow([
          nombreTurno,
          reporte.turno.local,
          reporte.turno.fecha_apertura,
          reporte.turno.fecha_cierre,
          reporte.turno.saldo_inicial,
          reporte.turno.saldo_final,
          reporte.resumen.total_ventas,
          reporte.resumen.total_retiros,
          reporte.resumen.balance,
          reporte.resumen.promedio_por_comanda
        ]);
      });

      // Hojas detalle por turno
      data.forEach((reporte, idx) => {
        const nombreTurno = reporte.turno.descripcion || (reporte.turno.id ? `Turno ${reporte.turno.id}` : 'Turno');
        const safeName = `${nombreTurno}`.replace(/[/\\?*\[\]:]/g, ' ').slice(0, 28) || `Turno_${idx + 1}`;
        const sheet = workbook.addWorksheet(safeName);

        sheet.addRow([`Reporte de Caja - ${nombreTurno}`]);
        sheet.addRow([]);
        sheet.addRow(['Local', reporte.turno.local]);
        sheet.addRow(['Fecha Apertura', reporte.turno.fecha_apertura]);
        sheet.addRow(['Fecha Cierre', reporte.turno.fecha_cierre]);
        sheet.addRow(['Saldo Inicial', reporte.turno.saldo_inicial]);
        sheet.addRow(['Saldo Final', reporte.turno.saldo_final]);
        sheet.addRow([]);

        sheet.addRow(['Resumen']);
        sheet.addRow(['Total Comandas', reporte.resumen.total_comandas]);
        sheet.addRow(['Total Ventas', reporte.resumen.total_ventas]);
        sheet.addRow(['Total Retiros', reporte.resumen.total_retiros]);
        sheet.addRow(['Balance', reporte.resumen.balance]);
        sheet.addRow(['Promedio por Comanda', reporte.resumen.promedio_por_comanda]);
        sheet.addRow([]);

        sheet.addRow(['Ventas']);
        sheet.addRow(['ID', 'Fecha', 'Total', 'Vendedor']);
        reporte.ventas.forEach(v => {
          sheet.addRow([v.id, v.fecha, v.total, v.vendedor]);
        });
        sheet.addRow([]);

        sheet.addRow(['Pagos por Método']);
        sheet.addRow(['Método', 'Total']);
        reporte.pagos.forEach(p => {
          sheet.addRow([p.metodo, p.total]);
        });
        sheet.addRow([]);

        sheet.addRow(['Retiros de Caja']);
        sheet.addRow(['ID', 'Fecha', 'Monto', 'Motivo', 'Usuario']);
        reporte.retiros.forEach(r => {
          sheet.addRow([r.id, r.fecha, r.monto, r.motivo, r.usuario]);
        });
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=reporte_caja_${desde}_a_${hasta}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } else {
      res.json(data);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// KPIs: ventas por día/hora, ticket promedio, margen bruto (requiere costo en productos)
exports.getKpis = async (req, res) => {
  try {
    const { desde, hasta, local_id } = req.query;
    const usuario = req.usuario;

    const fechaDesde = desde ? `${desde} 00:00:00` : '1970-01-01 00:00:00';
    const fechaHasta = hasta ? `${hasta} 23:59:59` : '2999-12-31 23:59:59';

    // Ventas por día
    const ventasPorDia = await db.query(
      `SELECT DATE(v.fecha) AS dia, SUM(v.total) AS total_dia, COUNT(*) AS tickets
       FROM ventas v
       WHERE v.negocio_id = $1
         AND v.fecha BETWEEN $2::timestamp AND $3::timestamp
         ${local_id ? 'AND v.local_id = $4' : ''}
       GROUP BY DATE(v.fecha)
       ORDER BY DATE(v.fecha)` ,
      local_id ? [usuario.negocio_id, fechaDesde, fechaHasta, local_id] : [usuario.negocio_id, fechaDesde, fechaHasta]
    );

    // Ventas por hora
    const ventasPorHora = await db.query(
      `SELECT EXTRACT(HOUR FROM v.fecha) AS hora, SUM(v.total) AS total_hora, COUNT(*) AS tickets
       FROM ventas v
       WHERE v.negocio_id = $1
         AND v.fecha BETWEEN $2::timestamp AND $3::timestamp
         ${local_id ? 'AND v.local_id = $4' : ''}
       GROUP BY EXTRACT(HOUR FROM v.fecha)
       ORDER BY EXTRACT(HOUR FROM v.fecha)` ,
      local_id ? [usuario.negocio_id, fechaDesde, fechaHasta, local_id] : [usuario.negocio_id, fechaDesde, fechaHasta]
    );

    // Ticket promedio
    const ticketProm = await db.query(
      `SELECT AVG(v.total) AS ticket_promedio, SUM(v.total) AS total, COUNT(*) AS tickets
       FROM ventas v
       WHERE v.negocio_id = $1
         AND v.fecha BETWEEN $2::timestamp AND $3::timestamp
         ${local_id ? 'AND v.local_id = $4' : ''}` ,
      local_id ? [usuario.negocio_id, fechaDesde, fechaHasta, local_id] : [usuario.negocio_id, fechaDesde, fechaHasta]
    );

    // Margen bruto: requiere que exista costo en productos. Si no está, devolver null.
    let margen = { margen_bruto: null, costo_total: null, ingreso_total: null };
    try {
      const margenResult = await db.query(
        `SELECT SUM(li.cantidad * p.precio) AS ingreso_total,
                SUM(li.cantidad * COALESCE(p.costo, 0)) AS costo_total
         FROM ventas v
         JOIN lineas_venta li ON li.venta_id = v.id
         JOIN productos p ON p.id = li.producto_id
         WHERE v.negocio_id = $1
           AND v.fecha BETWEEN $2::timestamp AND $3::timestamp
           ${local_id ? 'AND v.local_id = $4' : ''}` ,
        local_id ? [usuario.negocio_id, fechaDesde, fechaHasta, local_id] : [usuario.negocio_id, fechaDesde, fechaHasta]
      );
      if (margenResult.rows.length > 0) {
        const ingreso = parseFloat(margenResult.rows[0].ingreso_total || 0);
        const costo = parseFloat(margenResult.rows[0].costo_total || 0);
        margen = {
          ingreso_total: ingreso,
          costo_total: costo,
          margen_bruto: ingreso > 0 ? ((ingreso - costo) / ingreso) : null
        };
      }
    } catch (e) {
      // si no existe la columna costo o la tabla lineas_venta, ignorar margen
      margen = { margen_bruto: null, costo_total: null, ingreso_total: null };
    }

    res.json({
      ventas_por_dia: ventasPorDia.rows,
      ventas_por_hora: ventasPorHora.rows,
      ticket_promedio: ticketProm.rows[0] || { ticket_promedio: null, total: null, tickets: 0 },
      margen
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};