const db = require('../db');
const { registrarMovimiento } = require('../utils/movimientosProductos');

// Crear producto con categorías
exports.create = async (req, res) => {
  try {
    const { nombre, precio, stock_total, categorias } = req.body;
    const usuario = req.usuario;

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO productos (nombre, precio, stock_total, negocio_id)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [nombre, precio, stock_total, usuario.negocio_id]
      );

      const producto = result.rows[0];

      // Asociar categorías si se enviaron
      if (categorias && categorias.length > 0) {
        for (const categoriaId of categorias) {
          await client.query(
            `INSERT INTO producto_categoria (producto_id, categoria_id)
             VALUES ($1, $2)`,
            [producto.id, categoriaId]
          );
        }
        // Seteamos la categoría principal (columna legacy) al nombre de la primera categoría
        const catRes = await client.query(`SELECT nombre FROM categorias WHERE id=$1`, [categorias[0]]);
        const catNombre = catRes.rows[0]?.nombre || null;
        await client.query(`UPDATE productos SET categoria = $1 WHERE id = $2`, [catNombre, producto.id]);
        producto.categoria = catNombre;
      }

      // Movimiento inicial si hay stock
      const stockInicial = parseFloat(stock_total) || 0;
      if (stockInicial !== 0) {
        await registrarMovimiento({
          client,
          negocio_id: usuario.negocio_id,
          local_id: usuario.local_id || null,
          producto_id: producto.id,
          cantidad: stockInicial,
          tipo: 'alta_producto',
          motivo: 'Stock inicial',
          usuario_id: usuario.id,
          referencia: { producto_id: producto.id, stock_prev: 0, stock_nuevo: stockInicial }
        });
      }

      await client.query('COMMIT');
      res.status(201).json({ message: "Producto creado", producto });
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

// Listar productos con categorías
exports.getAll = async (req, res) => {
  try {
    const usuario = req.usuario;

    const result = await db.query(
      `SELECT p.*, 
              COALESCE(JSON_AGG(c.nombre) FILTER (WHERE c.id IS NOT NULL), '[]') AS categorias,
              COALESCE(JSON_AGG(c.id)     FILTER (WHERE c.id IS NOT NULL), '[]') AS categoria_ids
       FROM productos p
       LEFT JOIN producto_categoria pc ON p.id = pc.producto_id
       LEFT JOIN categorias c ON pc.categoria_id = c.id
       WHERE p.negocio_id=$1
       GROUP BY p.id
       ORDER BY p.nombre ASC`,
      [usuario.negocio_id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Obtener producto por ID con categorías
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;

    const result = await db.query(
      `SELECT p.*, 
              COALESCE(JSON_AGG(c.nombre) FILTER (WHERE c.id IS NOT NULL), '[]') AS categorias,
              COALESCE(JSON_AGG(c.id)     FILTER (WHERE c.id IS NOT NULL), '[]') AS categoria_ids
       FROM productos p
       LEFT JOIN producto_categoria pc ON p.id = pc.producto_id
       LEFT JOIN categorias c ON pc.categoria_id = c.id
       WHERE p.id=$1 AND p.negocio_id=$2
       GROUP BY p.id`,
      [id, usuario.negocio_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Actualizar producto y categorías
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, precio, stock_total, categorias } = req.body;
    const usuario = req.usuario;

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const prev = await client.query(
        'SELECT stock_total FROM productos WHERE id=$1 AND negocio_id=$2 FOR UPDATE',
        [id, usuario.negocio_id]
      );

      if (prev.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: "Producto no encontrado o no pertenece a tu negocio" });
      }

      const stockPrev = parseFloat(prev.rows[0].stock_total) || 0;

      const result = await client.query(
        `UPDATE productos
         SET nombre=$1, precio=$2, stock_total=$3
         WHERE id=$4 AND negocio_id=$5
         RETURNING *`,
        [nombre, precio, stock_total, id, usuario.negocio_id]
      );

      const producto = result.rows[0];

      // Actualizar categorías
      await client.query(`DELETE FROM producto_categoria WHERE producto_id=$1`, [id]);
      if (categorias && categorias.length > 0) {
        for (const categoriaId of categorias) {
          await client.query(
            `INSERT INTO producto_categoria (producto_id, categoria_id)
             VALUES ($1, $2)`,
            [id, categoriaId]
          );
        }
        const catRes = await client.query(`SELECT nombre FROM categorias WHERE id=$1`, [categorias[0]]);
        const catNombre = catRes.rows[0]?.nombre || null;
        await client.query(`UPDATE productos SET categoria = $1 WHERE id = $2`, [catNombre, id]);
        producto.categoria = catNombre;
      } else {
        await client.query(`UPDATE productos SET categoria = NULL WHERE id = $1`, [id]);
        producto.categoria = null;
      }

      // Registrar ajuste de stock si cambió
      const stockNuevo = parseFloat(stock_total);
      const delta = stockNuevo - stockPrev;
      if (Number.isFinite(delta) && delta !== 0) {
        await registrarMovimiento({
          client,
          negocio_id: usuario.negocio_id,
          local_id: usuario.local_id || null,
          producto_id: producto.id,
          cantidad: delta,
          tipo: 'ajuste',
          motivo: 'Actualizacion de producto',
          usuario_id: usuario.id,
          referencia: { producto_id: producto.id, stock_prev: stockPrev, stock_nuevo: stockNuevo }
        });
      }

      await client.query('COMMIT');
      res.json({ message: "Producto actualizado", producto });
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

// Eliminar producto y asociaciones
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;

    await db.query(`DELETE FROM producto_categoria WHERE producto_id=$1`, [id]);

    const result = await db.query(
      `DELETE FROM productos WHERE id=$1 AND negocio_id=$2 RETURNING *`,
      [id, usuario.negocio_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Producto no encontrado o no pertenece a tu negocio" });
    }

    res.json({ message: "Producto eliminado", producto: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Ajuste manual de stock de producto (entrada/salida)
exports.ajustarStock = async (req, res) => {
  const { id } = req.params;
  const { cantidad, motivo } = req.body;
  const usuario = req.usuario;

  const delta = parseFloat(cantidad);
  if (!Number.isFinite(delta) || delta === 0) {
    return res.status(400).json({ message: 'cantidad debe ser numérica y distinta de cero' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const prodRes = await client.query(
      'SELECT stock_total FROM productos WHERE id=$1 AND negocio_id=$2 FOR UPDATE',
      [id, usuario.negocio_id]
    );

    if (prodRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Producto no encontrado o no pertenece a tu negocio' });
    }

    const stockPrev = parseFloat(prodRes.rows[0].stock_total) || 0;
    const stockNuevo = stockPrev + delta;
    if (stockNuevo < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Stock insuficiente: la operación dejaría el stock negativo' });
    }

    const updRes = await client.query(
      'UPDATE productos SET stock_total=$1 WHERE id=$2 RETURNING *',
      [stockNuevo, id]
    );

    await registrarMovimiento({
      client,
      negocio_id: usuario.negocio_id,
      local_id: usuario.local_id || null,
      producto_id: Number(id),
      cantidad: delta,
      tipo: delta > 0 ? 'ajuste_entrada' : 'ajuste_salida',
      motivo: motivo || null,
      usuario_id: usuario.id,
      referencia: { ajuste: true, stock_prev: stockPrev, stock_nuevo: stockNuevo }
    });

    await client.query('COMMIT');
    res.json({ message: 'Ajuste registrado', producto: updRes.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

// Ajuste masivo de precios (por porcentaje o valor, reversible)
exports.ajusteMasivoPrecios = async (req, res) => {
  const usuario = req.usuario;
  const negocioId = usuario.negocio_id;
  const { tipo_ajuste, valor, categoria_id, observacion } = req.body;

  if (!['porcentaje', 'valor'].includes(tipo_ajuste)) {
    return res.status(400).json({ message: 'Tipo de ajuste inválido' });
  }
  const ajuste = Number(valor);
  if (!Number.isFinite(ajuste) || ajuste === 0) {
    return res.status(400).json({ message: 'Valor de ajuste inválido' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Seleccionar productos afectados
    let productosRes;
    if (categoria_id) {
      productosRes = await client.query(
        `SELECT p.id, p.precio FROM productos p
         JOIN producto_categoria pc ON p.id = pc.producto_id
         WHERE p.negocio_id = $1 AND pc.categoria_id = $2 FOR UPDATE`,
        [negocioId, categoria_id]
      );
    } else {
      productosRes = await client.query(
        `SELECT id, precio FROM productos WHERE negocio_id = $1 FOR UPDATE`,
        [negocioId]
      );
    }
    const productos = productosRes.rows;
    if (productos.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'No hay productos para ajustar' });
    }
    // Registrar ajuste principal
    const ajusteRes = await client.query(
      `INSERT INTO ajustes_precios (negocio_id, usuario_id, tipo_ajuste, valor, categoria_id, observacion)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [negocioId, usuario.id, tipo_ajuste, ajuste, categoria_id || null, observacion || null]
    );
    const ajusteId = ajusteRes.rows[0].id;
    // Aplicar ajuste y registrar detalle
    for (const prod of productos) {
      const precio_anterior = Number(prod.precio);
      let precio_nuevo = precio_anterior;
      if (tipo_ajuste === 'porcentaje') {
        precio_nuevo = Math.round((precio_anterior * (1 + ajuste / 100)) * 100) / 100;
      } else {
        precio_nuevo = Math.round((precio_anterior + ajuste) * 100) / 100;
      }
      await client.query(
        `UPDATE productos SET precio = $1 WHERE id = $2`,
        [precio_nuevo, prod.id]
      );
      await client.query(
        `INSERT INTO ajustes_precios_detalle (ajuste_id, producto_id, precio_anterior, precio_nuevo)
         VALUES ($1, $2, $3, $4)`,
        [ajusteId, prod.id, precio_anterior, precio_nuevo]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Ajuste aplicado', ajuste_id: ajusteId, productos_afectados: productos.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

// Revertir un ajuste masivo de precios
exports.revertirAjusteMasivo = async (req, res) => {
  const usuario = req.usuario;
  const negocioId = usuario.negocio_id;
  const { id } = req.params; // id del ajuste

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Verificar que el ajuste existe y no está revertido
    const ajusteRes = await client.query(
      `SELECT * FROM ajustes_precios WHERE id = $1 AND negocio_id = $2 AND revertido = FALSE FOR UPDATE`,
      [id, negocioId]
    );
    if (ajusteRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Ajuste no encontrado o ya revertido' });
    }
    // Obtener productos afectados
    const detallesRes = await client.query(
      `SELECT producto_id, precio_anterior FROM ajustes_precios_detalle WHERE ajuste_id = $1`,
      [id]
    );
    if (detallesRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'No hay productos para revertir' });
    }
    // Revertir precios
    for (const det of detallesRes.rows) {
      await client.query(
        `UPDATE productos SET precio = $1 WHERE id = $2 AND negocio_id = $3`,
        [det.precio_anterior, det.producto_id, negocioId]
      );
    }
    // Marcar ajuste como revertido
    await client.query(
      `UPDATE ajustes_precios SET revertido = TRUE WHERE id = $1`,
      [id]
    );
    await client.query('COMMIT');
    res.json({ message: 'Ajuste revertido', productos_afectados: detallesRes.rows.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};