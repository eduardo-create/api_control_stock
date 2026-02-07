const db = require('../db');

// Devuelve los permisos asignados al usuario actual
exports.listPermissions = async (req, res) => {
  try {
    const usuario = req.usuario;
    // Si es superadmin, devolver todos los permisos
    if (usuario.rol === 'superadmin') {
      const result = await db.query('SELECT DISTINCT permission FROM permissions');
      return res.json(result.rows.map(r => r.permission));
    }
    // Para admin y otros, devolver solo los permisos asignados
    const result = await db.query(
      `SELECT DISTINCT rp.permission
       FROM user_roles ur
       JOIN role_permissions rp ON ur.role_id = rp.role_id
       WHERE ur.user_id = $1`,
      [usuario.id]
    );
    res.json(result.rows.map(r => r.permission));
  } catch (err) {
    res.status(500).json({ message: 'Error al listar permisos', error: err.message });
  }
};
