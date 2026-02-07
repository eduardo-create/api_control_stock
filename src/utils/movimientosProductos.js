const db = require('../db');

/**
 * Registra un movimiento de stock de producto.
 * cantidad positiva = entrada, negativa = salida.
 * Usa el cliente de transacción si se pasa, sino abre conexión propia.
 */
async function registrarMovimiento({ client, negocio_id, local_id = null, producto_id, cantidad, tipo, motivo = null, usuario_id = null, referencia = null }) {
  const runner = client || (await db.connect());
  let release = false;
  try {
    if (!client) {
      await runner.query('BEGIN');
      release = true;
    }

    await runner.query(
      `INSERT INTO movimientos_productos (negocio_id, local_id, producto_id, cantidad, tipo, motivo, usuario_id, referencia)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [negocio_id, local_id, producto_id, cantidad, tipo, motivo, usuario_id, referencia ? JSON.stringify(referencia) : null]
    );

    if (release) {
      await runner.query('COMMIT');
    }
  } catch (err) {
    if (release) {
      await runner.query('ROLLBACK');
    }
    throw err;
  } finally {
    if (release) {
      runner.release();
    }
  }
}

module.exports = { registrarMovimiento };
