const db = require('../db');

// Cache simple por request para no consultar information_schema repetidamente
async function columnExists(table, column, cache) {
  const key = `${table}.${column}`;
  if (key in cache) return cache[key];
  const res = await db.query(
    'SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 LIMIT 1',
    [table, column]
  );
  cache[key] = res.rowCount > 0;
  return cache[key];
}

function buildAlert({ tipo, severidad = 'media', mensaje, producto, local, meta }) {
  return {
    id: `${tipo}-${producto || ''}-${local || ''}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    tipo,
    severidad,
    mensaje,
    producto,
    local,
    meta,
    created_at: new Date().toISOString()
  };
}

exports.getAlertas = async (req, res) => {
  const usuario = req.usuario || {};
  const negocioId = usuario.negocio_id || null;
  const alerts = [];
  const cache = {};

  // ==============================
  // Stock bajo y ruptura de stock
  // ==============================
  try {
    const hasNegocio = await columnExists('productos', 'negocio_id', cache);
    const hasMinimo = await columnExists('productos', 'stock_minimo', cache);

    const params = [];
    let where = '';
    if (hasNegocio && negocioId) {
      params.push(negocioId);
      where = 'WHERE p.negocio_id = $1';
    }

    const sql = `
      SELECT p.id, p.nombre AS producto, COALESCE(p.stock_total, 0) AS stock_total,
             ${hasMinimo ? 'COALESCE(p.stock_minimo, 5)' : '5'} AS stock_minimo
      FROM productos p
      ${where}
      ORDER BY stock_total ASC
      LIMIT 200
    `;

    const { rows } = await db.query(sql, params);

    rows.forEach(r => {
      if (Number(r.stock_total) <= 0) {
        alerts.push(buildAlert({
          tipo: 'Ruptura de stock',
          severidad: 'alta',
          mensaje: `${r.producto || 'Producto'} sin stock`,
          producto: r.producto,
          meta: { stock: Number(r.stock_total) }
        }));
      } else if (Number(r.stock_total) <= Number(r.stock_minimo)) {
        alerts.push(buildAlert({
          tipo: 'Stock bajo',
          severidad: 'media',
          mensaje: `${r.producto || 'Producto'} bajo mínimo (${r.stock_total}/${r.stock_minimo})`,
          producto: r.producto,
          meta: { stock: Number(r.stock_total), minimo: Number(r.stock_minimo) }
        }));
      }
    });
  } catch (e) {
    console.error('Error calculando alertas de stock:', e.message || e);
  }

  // =====================================
  // Productos sin rotación / inmovilizado
  // =====================================
  try {
    const hasVentas = await columnExists('ventas', 'id', cache);
    const hasDetalle = await columnExists('detalle_venta', 'producto_id', cache);
    if (hasVentas && hasDetalle) {
      const hasNegocioVentas = await columnExists('ventas', 'negocio_id', cache);
      const params = [];
      let where = '';
      if (hasNegocioVentas && negocioId) {
        params.push(negocioId);
        where = 'WHERE v.negocio_id = $1';
      }

      const sql = `
        SELECT dv.producto_id, p.nombre AS producto, MAX(v.fecha) AS ultima_venta,
               COALESCE(p.stock_total, 0) AS stock_total
        FROM ventas v
        JOIN detalle_venta dv ON dv.venta_id = v.id
        JOIN productos p ON p.id = dv.producto_id
        ${where}
        GROUP BY dv.producto_id, p.nombre, p.stock_total
        HAVING MAX(v.fecha) <= (NOW() - INTERVAL '90 days')
        ORDER BY MAX(v.fecha) ASC NULLS FIRST
        LIMIT 100
      `;

      const { rows } = await db.query(sql, params);
      rows.forEach(r => {
        alerts.push(buildAlert({
          tipo: 'Inmovilizado',
          severidad: 'media',
          mensaje: `${r.producto || 'Producto'} sin ventas hace 90+ días`,
          producto: r.producto,
          meta: { stock: Number(r.stock_total), ultima_venta: r.ultima_venta }
        }));
      });
    }
  } catch (e) {
    console.error('Error calculando alertas de rotación:', e.message || e);
  }

  // =====================================
  // Caída de ventas vs promedio semanal
  // =====================================
  try {
    const hasVentas = await columnExists('ventas', 'id', cache);
    if (hasVentas) {
      const hasNegocioVentas = await columnExists('ventas', 'negocio_id', cache);
      const params = [];
      const conditions = [];
      if (hasNegocioVentas && negocioId) {
        params.push(negocioId);
        conditions.push(`negocio_id = $${params.length}`);
      }

      const baseWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const recienteWhere = conditions.length
        ? `${baseWhere} AND fecha >= (NOW() - INTERVAL '7 days')`
        : `WHERE fecha >= (NOW() - INTERVAL '7 days')`;

      const sqlReciente = `SELECT COALESCE(SUM(total), 0) AS total FROM ventas ${recienteWhere}`;
      const sqlPromedio = `SELECT COALESCE(AVG(total_por_dia), 0) AS promedio
        FROM (
          SELECT DATE(fecha) AS dia, SUM(total) AS total_por_dia
          FROM ventas
          ${baseWhere}
          GROUP BY DATE(fecha)
          ORDER BY dia DESC
          LIMIT 28
        ) t`;

      const totalParams = params.length ? params : [];
      const promParams = params.length ? params : [];
      const [recienteRes, promedioRes] = await Promise.all([
        db.query(sqlReciente, totalParams),
        db.query(sqlPromedio, promParams)
      ]);

      const totalReciente = Number(recienteRes.rows?.[0]?.total || 0);
      const promedio = Number(promedioRes.rows?.[0]?.promedio || 0);
      if (promedio > 0 && totalReciente < promedio * 0.7) {
        alerts.push(buildAlert({
          tipo: 'Caída de ventas',
          severidad: 'media',
          mensaje: `Ventas últimos 7 días por debajo del 70% del promedio (${totalReciente.toFixed(0)} vs ${promedio.toFixed(0)})`,
          meta: { total_reciente: totalReciente, promedio_diario: promedio }
        }));
      }
    }
  } catch (e) {
    console.error('Error calculando alerta de caída de ventas:', e.message || e);
  }

  // Si no hay alertas, devolvemos arreglo vacío igual
  return res.json(alerts);
};
