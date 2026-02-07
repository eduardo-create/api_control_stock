const db = require('../db');

async function validarLocal(usuario, localIdRaw, client) {
  const runner = client || db;
  const localId = parseInt(localIdRaw, 10);
  if (Number.isNaN(localId)) {
    return { ok: false, status: 400, message: 'local_id inválido' };
  }

  const localRes = await runner.query('SELECT id, negocio_id FROM locales WHERE id=$1', [localId]);
  if (localRes.rows.length === 0) {
    return { ok: false, status: 404, message: 'Local no encontrado' };
  }

  const negocioIdLocal = localRes.rows[0].negocio_id;
  if (usuario.rol !== 'superadmin' && negocioIdLocal !== usuario.negocio_id) {
    return { ok: false, status: 403, message: 'No tienes permiso para este local' };
  }

  return { ok: true, localId, negocioId: negocioIdLocal };
}

async function validarProveedor(proveedorIdRaw, negocioId, client) {
  if (!proveedorIdRaw) return { ok: true, proveedorId: null };
  const runner = client || db;
  const proveedorId = parseInt(proveedorIdRaw, 10);
  if (Number.isNaN(proveedorId)) {
    return { ok: false, status: 400, message: 'proveedor_id inválido' };
  }

  const prov = await runner.query(
    `SELECT p.id
     FROM proveedores p
     LEFT JOIN negocio_proveedor np ON np.proveedor_id = p.id
     WHERE p.id = $1 AND (np.negocio_id = $2 OR $2 IS NULL)
     LIMIT 1`,
    [proveedorId, negocioId || null]
  );

  if (prov.rows.length === 0) {
    return { ok: false, status: 404, message: 'Proveedor no encontrado para este negocio' };
  }

  return { ok: true, proveedorId };
}

// Registrar compra y actualizar stock_local e insumos
exports.create = async (req, res) => {
  const client = await db.connect();
  try {
    const { proveedor_id, local_id, detalles } = req.body; // detalles: [{ insumo_id, cantidad, precio_unitario }]
    const usuario = req.usuario;

    if (!Array.isArray(detalles) || detalles.length === 0) {
      return res.status(400).json({ message: 'Debe enviar al menos un detalle de compra' });
    }

    const accesoLocal = await validarLocal(usuario, local_id, client);
    if (!accesoLocal.ok) {
      return res.status(accesoLocal.status).json({ message: accesoLocal.message });
    }

    const proveedorVal = await validarProveedor(proveedor_id, usuario.rol === 'superadmin' ? null : usuario.negocio_id, client);
    if (!proveedorVal.ok) {
      return res.status(proveedorVal.status).json({ message: proveedorVal.message });
    }

    const detallesLimpios = detalles.map((d) => ({
      insumo_id: Number(d.insumo_id),
      cantidad: Number(d.cantidad),
      precio_unitario: Number(d.precio_unitario)
    })).filter(d => Number.isFinite(d.insumo_id) && Number.isFinite(d.cantidad) && Number.isFinite(d.precio_unitario));

    if (detallesLimpios.length === 0) {
      return res.status(400).json({ message: 'Los detalles deben contener insumo_id, cantidad y precio_unitario numéricos' });
    }

    const total = detallesLimpios.reduce((acc, d) => acc + (d.cantidad * d.precio_unitario), 0);

    await client.query('BEGIN');

    const compraResult = await client.query(
      `INSERT INTO compras (proveedor_id, usuario_id, negocio_id, local_id, total) VALUES ($1, $2, $3, $4, $5) RETURNING id, fecha`,
      [proveedorVal.proveedorId, usuario.id, accesoLocal.negocioId || usuario.negocio_id, accesoLocal.localId, total]
    );
    const compraId = compraResult.rows[0].id;

    for (const item of detallesLimpios) {
      const { insumo_id, cantidad, precio_unitario } = item;

      await client.query(
        `INSERT INTO detalle_compra (compra_id, insumo_id, cantidad, precio_unitario) VALUES ($1, $2, $3, $4)`,
        [compraId, insumo_id, cantidad, precio_unitario]
      );

      const stockRes = await client.query(
        `SELECT cantidad FROM stock_local WHERE local_id=$1 AND insumo_id=$2`,
        [accesoLocal.localId, insumo_id]
      );

      if (stockRes.rows.length === 0) {
        await client.query(
          `INSERT INTO stock_local (local_id, insumo_id, cantidad) VALUES ($1, $2, $3)`,
          [accesoLocal.localId, insumo_id, cantidad]
        );
      } else {
        await client.query(
          `UPDATE stock_local SET cantidad = cantidad + $1 WHERE local_id=$2 AND insumo_id=$3`,
          [cantidad, accesoLocal.localId, insumo_id]
        );
      }

      await client.query(
        `UPDATE insumos SET stock_total = stock_total + $1 WHERE id=$2`,
        [cantidad, insumo_id]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Compra registrada', compraId, total });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

// Listar compras (por negocio, opcional por proveedor o local)
exports.getAll = async (req, res) => {
  try {
    const usuario = req.usuario;
    const { proveedor_id, local_id } = req.query;

    const params = [usuario.negocio_id];
    const where = ['c.negocio_id = $1'];

    if (proveedor_id) {
      params.push(proveedor_id);
      where.push(`c.proveedor_id = $${params.length}`);
    }
    if (local_id) {
      params.push(local_id);
      where.push(`c.local_id = $${params.length}`);
    }

    const query = `
      SELECT
        c.id,
        c.fecha,
        c.total,
        c.local_id,
        l.nombre AS local,
        c.proveedor_id,
        p.nombre AS proveedor,
        json_agg(
          json_build_object(
            'insumo_id', dc.insumo_id,
            'nombre', i.nombre,
            'cantidad', dc.cantidad,
            'precio_unitario', dc.precio_unitario,
            'subtotal', dc.cantidad * dc.precio_unitario
          )
          ORDER BY i.nombre
        ) FILTER (WHERE dc.id IS NOT NULL) AS detalles
      FROM compras c
      LEFT JOIN locales l ON l.id = c.local_id
      LEFT JOIN proveedores p ON p.id = c.proveedor_id
      LEFT JOIN detalle_compra dc ON dc.compra_id = c.id
      LEFT JOIN insumos i ON i.id = dc.insumo_id
      WHERE ${where.join(' AND ')}
      GROUP BY c.id, c.fecha, c.total, c.local_id, l.nombre, c.proveedor_id, p.nombre
      ORDER BY c.fecha DESC;
    `;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
