const db = require('../db');

const TURNOS = ['todos', 'manana', 'tarde', 'noche'];
const TIPOS_DESCUENTO = ['ninguno', 'porcentaje', 'fijo'];

function validatePayload(body, { esUpdate = false } = {}) {
  const {
    nombre,
    descripcion,
    valido_desde,
    valido_hasta,
    turno = 'todos',
    categoria_id,
    tipo_descuento = 'ninguno',
    valor_descuento = 0,
    precio_final,
    iva = 21,
    excluir_categorias = false,
    limite_por_pedido = null,
    dias = [],
    configuraciones = []
  } = body;

  if (!esUpdate) {
    if (!nombre || !precio_final) return 'Nombre y precio_final son obligatorios';
  }

  if (turno && !TURNOS.includes(turno)) return 'Turno inválido';
  if (tipo_descuento && !TIPOS_DESCUENTO.includes(tipo_descuento)) return 'Tipo de descuento inválido';
  if (tipo_descuento === 'porcentaje' && (valor_descuento < 0 || valor_descuento > 100)) return 'Porcentaje de descuento inválido';
  if (tipo_descuento === 'fijo' && valor_descuento < 0) return 'Descuento fijo inválido';
  if (limite_por_pedido !== null && limite_por_pedido !== undefined) {
    const n = Number(limite_por_pedido);
    if (Number.isNaN(n) || n < 1 || n > 10) return 'Límite por pedido debe estar entre 1 y 10';
  }
  if (valido_hasta && valido_desde && new Date(valido_hasta) < new Date(valido_desde)) return 'La fecha fin debe ser mayor o igual a la fecha inicio';
  if (!Array.isArray(dias) || dias.some(d => d < 0 || d > 6)) return 'Días inválidos';

  if (configuraciones && Array.isArray(configuraciones)) {
    for (const cfg of configuraciones) {
      if (!cfg.categoria_id) return 'Cada configuración requiere categoria_id';
      if (!cfg.aplica_todos && !cfg.producto_id) return 'Config requiere producto_id cuando aplica_todos es falso';
      if (cfg.cantidad_min < 0) return 'cantidad_min no puede ser negativa';
      if (cfg.cantidad_max && cfg.cantidad_max < cfg.cantidad_min) return 'cantidad_max debe ser >= cantidad_min';
    }
  }
  return null;
}

async function insertDias(client, promocion_id, dias) {
  if (!Array.isArray(dias)) return;
  for (const dia of dias) {
    await client.query(
      `INSERT INTO promocion_dias (promocion_id, dia) VALUES ($1, $2)
       ON CONFLICT (promocion_id, dia) DO NOTHING`,
      [promocion_id, dia]
    );
  }
}

async function insertConfigs(client, promocion_id, configuraciones) {
  if (!Array.isArray(configuraciones)) return;
  for (const cfg of configuraciones) {
    const {
      categoria_id,
      aplica_todos = true,
      producto_id = null,
      cantidad_min = 0,
      cantidad_max = 0
    } = cfg;
    await client.query(
      `INSERT INTO promocion_config (promocion_id, categoria_id, aplica_todos, producto_id, cantidad_min, cantidad_max)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [promocion_id, categoria_id, aplica_todos, producto_id, cantidad_min, cantidad_max]
    );
  }
}

async function buildDetalle(promos) {
  if (!Array.isArray(promos) || promos.length === 0) return [];
  const ids = promos.map(p => p.id);
  const diasRes = await db.query(
    `SELECT promocion_id, dia FROM promocion_dias WHERE promocion_id = ANY($1::int[])`,
    [ids]
  );
  const configRes = await db.query(
    `SELECT id, promocion_id, categoria_id, aplica_todos, producto_id, cantidad_min, cantidad_max
     FROM promocion_config WHERE promocion_id = ANY($1::int[])`,
    [ids]
  );

  return promos.map(p => ({
    ...p,
    dias: diasRes.rows.filter(r => r.promocion_id === p.id).map(r => r.dia),
    configuraciones: configRes.rows.filter(r => r.promocion_id === p.id)
  }));
}

// Crear promoción (solo admin del negocio)
exports.create = async (req, res) => {
  const client = await db.connect();
  try {
    const usuario = req.usuario;
    if (usuario.rol !== 'admin') {
      return res.status(403).json({ message: 'Solo admins del negocio pueden crear promociones' });
    }

    const validation = validatePayload(req.body, { esUpdate: false });
    if (validation) return res.status(400).json({ message: validation });

    const {
      nombre,
      descripcion,
      valido_desde,
      valido_hasta,
      turno = 'todos',
      categoria_id,
      tipo_descuento = 'ninguno',
      valor_descuento = 0,
      precio_final,
      iva = 21,
      excluir_categorias = false,
      limite_por_pedido = null,
      dias = [],
      configuraciones = []
    } = req.body;

    await client.query('BEGIN');

    const promoRes = await client.query(
      `INSERT INTO promociones
       (negocio_id, categoria_id, nombre, descripcion, valido_desde, valido_hasta, turno, tipo_descuento, valor_descuento, precio_final, iva, excluir_categorias, limite_por_pedido)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [usuario.negocio_id, categoria_id || null, nombre, descripcion || null, valido_desde, valido_hasta || null, turno, tipo_descuento, valor_descuento || 0, precio_final, iva, excluir_categorias, limite_por_pedido || null]
    );

    const promocion = promoRes.rows[0];

    await insertDias(client, promocion.id, dias);
    await insertConfigs(client, promocion.id, configuraciones);

    await client.query('COMMIT');

    const detalle = await buildDetalle([promocion]);
    res.status(201).json({ message: 'Promoción creada', promocion: detalle[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

// Listar promociones del negocio (roles operativos permiten usar en POS)
exports.list = async (req, res) => {
  try {
    const usuario = req.usuario;
    const rolesPermitidos = ['admin', 'cajero', 'vendedor', 'encargado', 'consulta'];
    if (!rolesPermitidos.includes(usuario.rol)) return res.status(403).json({ message: 'No autorizado' });

    const promosRes = await db.query(
      `SELECT * FROM promociones WHERE negocio_id = $1 ORDER BY id DESC`,
      [usuario.negocio_id]
    );

    const promos = await buildDetalle(promosRes.rows);
    res.json(promos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Obtener detalle de una promoción
exports.getById = async (req, res) => {
  try {
    const usuario = req.usuario;
    const rolesPermitidos = ['admin', 'cajero', 'vendedor', 'encargado', 'consulta'];
    if (!rolesPermitidos.includes(usuario.rol)) return res.status(403).json({ message: 'No autorizado' });

    const promoRes = await db.query(
      `SELECT * FROM promociones WHERE id = $1 AND negocio_id = $2`,
      [req.params.id, usuario.negocio_id]
    );

    if (promoRes.rows.length === 0) return res.status(404).json({ message: 'Promoción no encontrada' });

    const [promo] = await buildDetalle(promoRes.rows);
    res.json(promo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Actualizar promoción
exports.update = async (req, res) => {
  const client = await db.connect();
  try {
    const usuario = req.usuario;
    if (usuario.rol !== 'admin') return res.status(403).json({ message: 'Solo admins del negocio' });

    const validation = validatePayload(req.body, { esUpdate: true });
    if (validation) return res.status(400).json({ message: validation });

    const id = req.params.id;
    const {
      nombre,
      descripcion,
      valido_desde,
      valido_hasta,
      turno = 'todos',
      categoria_id,
      tipo_descuento = 'ninguno',
      valor_descuento = 0,
      precio_final,
      iva = 21,
      excluir_categorias = false,
      limite_por_pedido = null,
      dias = [],
      configuraciones = [],
      activo = true
    } = req.body;

    await client.query('BEGIN');

    const updateRes = await client.query(
      `UPDATE promociones
       SET nombre = COALESCE($1, nombre),
           descripcion = $2,
           valido_desde = COALESCE($3, valido_desde),
           valido_hasta = $4,
           turno = COALESCE($5, turno),
           categoria_id = $6,
           tipo_descuento = COALESCE($7, tipo_descuento),
           valor_descuento = COALESCE($8, valor_descuento),
           precio_final = COALESCE($9, precio_final),
           iva = COALESCE($10, iva),
           excluir_categorias = COALESCE($11, excluir_categorias),
           limite_por_pedido = $12,
           activo = COALESCE($13, activo),
           updated_at = NOW()
       WHERE id = $14 AND negocio_id = $15
       RETURNING *`,
      [nombre, descripcion || null, valido_desde, valido_hasta || null, turno, categoria_id || null, tipo_descuento, valor_descuento || 0, precio_final, iva, excluir_categorias, limite_por_pedido || null, activo, id, usuario.negocio_id]
    );

    if (updateRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Promoción no encontrada' });
    }

    // Reemplazar días y configuraciones
    await client.query('DELETE FROM promocion_dias WHERE promocion_id = $1', [id]);
    await client.query('DELETE FROM promocion_config WHERE promocion_id = $1', [id]);
    await insertDias(client, id, dias);
    await insertConfigs(client, id, configuraciones);

    await client.query('COMMIT');

    const [detalle] = await buildDetalle(updateRes.rows);
    res.json({ message: 'Promoción actualizada', promocion: detalle });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

// Desactivar/eliminar lógica (soft delete)
exports.remove = async (req, res) => {
  try {
    const usuario = req.usuario;
    if (usuario.rol !== 'admin') return res.status(403).json({ message: 'Solo admins del negocio' });

    const result = await db.query(
      `UPDATE promociones SET activo = FALSE, updated_at = NOW() WHERE id = $1 AND negocio_id = $2 RETURNING id`,
      [req.params.id, usuario.negocio_id]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: 'Promoción no encontrada' });

    res.json({ message: 'Promoción desactivada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
