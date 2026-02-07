// Crear rol personalizado
exports.createRole = async (req, res) => {
  try {
    const usuario = req.usuario;
    const negocioId = usuario?.negocio_id;
    const { nombre, slug, permisos, baseRole } = req.body;
    if (!nombre || !slug || !Array.isArray(permisos) || !baseRole) {
      return res.status(400).json({ message: 'Datos incompletos' });
    }
    // Solo puede asignar permisos que posee
    const allowedPerms = usuario.rol === 'superadmin' ? permisos : permisos.filter(p => usuario.permissions.includes(p));
    const result = await db.query(
      `INSERT INTO roles (nombre, slug, negocio_id, personalizado, base_role) VALUES ($1, $2, $3, TRUE, $4) RETURNING id`,
      [nombre, slug, negocioId, baseRole]
    );
    const roleId = result.rows[0].id;
    // Asignar permisos
    for (const perm of allowedPerms) {
      await db.query(
        `INSERT INTO role_permissions (role_id, permission) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [roleId, perm]
      );
    }
    res.json({ id: roleId });
  } catch (err) {
    res.status(500).json({ message: 'Error al crear rol', error: err.message });
  }
};

// Editar rol personalizado
exports.updateRole = async (req, res) => {
  try {
    const usuario = req.usuario;
    const negocioId = usuario?.negocio_id;
    const roleId = req.params.id;
    const { nombre, slug, permisos, baseRole } = req.body;
    if (!nombre || !slug || !Array.isArray(permisos) || !baseRole) {
      return res.status(400).json({ message: 'Datos incompletos' });
    }
    // Solo puede asignar permisos que posee
    const allowedPerms = usuario.rol === 'superadmin' ? permisos : permisos.filter(p => usuario.permissions.includes(p));
    await db.query(
      `UPDATE roles SET nombre = $1, slug = $2, base_role = $3 WHERE id = $4 AND negocio_id = $5 AND personalizado = TRUE`,
      [nombre, slug, baseRole, roleId, negocioId]
    );
    // Actualizar permisos
    await db.query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]);
    for (const perm of allowedPerms) {
      await db.query(
        `INSERT INTO role_permissions (role_id, permission) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [roleId, perm]
      );
    }
    res.json({ id: roleId });
  } catch (err) {
    res.status(500).json({ message: 'Error al editar rol', error: err.message });
  }
};

// Eliminar rol personalizado
exports.deleteRole = async (req, res) => {
  try {
    const usuario = req.usuario;
    const negocioId = usuario?.negocio_id;
    const roleId = req.params.id;
    await db.query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]);
    await db.query(`DELETE FROM roles WHERE id = $1 AND negocio_id = $2 AND personalizado = TRUE`, [roleId, negocioId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar rol', error: err.message });
  }
};
// Listar roles base permitidos para crear roles personalizados
exports.listBaseRoles = async (req, res) => {
  try {
    const usuario = req.usuario;
    const negocioId = usuario?.negocio_id || null;
    // Solo roles globales (negocio_id IS NULL) y no personalizados
    const result = await db.query(
      `SELECT slug, nombre FROM roles WHERE negocio_id IS NULL AND personalizado = FALSE AND slug <> 'superadmin'`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Error al listar roles base', error: err.message });
  }
};
const db = require('../db');

exports.listRoles = async (req, res) => {
  try {
    const usuario = req.usuario;
    const negocioId = usuario?.negocio_id || null;

    const params = [negocioId];
    let where = 'WHERE (negocio_id IS NULL OR negocio_id = $1)';

    if (usuario?.rol !== 'superadmin') {
      where += " AND slug <> 'superadmin'";
    }

    const result = await db.query(
      `SELECT DISTINCT ON (slug) id, slug, nombre, negocio_id
       FROM roles
       ${where}
       ORDER BY slug, (negocio_id IS NULL) ASC, id ASC`,
      params
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Error al listar roles', error: err.message });
  }
};
