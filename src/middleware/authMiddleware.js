const jwt = require('jsonwebtoken');
const db = require('../db');

// Middleware de autenticación
exports.authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;

  const cookieHeader = req.headers['cookie'];
  let cookieToken = null;
  if (cookieHeader) {
    const tokenPair = cookieHeader
      .split(';')
      .map(p => p.trim())
      .find(p => p.startsWith('token='));
    if (tokenPair) {
      cookieToken = tokenPair.replace('token=', '');
    }
  }

  const token = bearerToken || cookieToken;
  if (!token) {
    return res.status(401).json({ message: "Token requerido (header o cookie)" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded; // { id, rol, negocio_id, local_id }
    next();
  } catch (err) {
    return res.status(403).json({ message: "Token inválido" });
  }
};

// Middleware de autorización por rol o permiso
exports.authorize = (rolesOrPerms = [], { allowSuperadmin = false } = {}) => {
  return async (req, res, next) => {
    const usuario = req.usuario;
    if (!usuario || (!usuario.rol && !usuario.id)) {
      return res.status(401).json({ message: "Usuario no autenticado o sin rol" });
    }

    if (!rolesOrPerms.length) return next();

    const isPermissionList = rolesOrPerms.some(r => r.includes(':'));

    if (!isPermissionList) {
      if (rolesOrPerms.includes(usuario.rol) || (allowSuperadmin && usuario.rol === 'superadmin')) {
        return next();
      }
      return res.status(403).json({ message: "Acceso denegado" });
    }

    if (allowSuperadmin && usuario.rol === 'superadmin') {
      return next();
    }

    const perms = usuario.permissions || usuario.permisos || [];
    if (Array.isArray(perms) && perms.length > 0) {
      if (rolesOrPerms.some(p => perms.includes(p))) return next();
      // Fallback a BD por tokens viejos o permisos desactualizados
    }

    try {
      const result = await db.query(
        `SELECT 1
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         JOIN role_permissions rp ON rp.role_id = r.id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE ur.user_id = $1
           AND p.slug = ANY($2)
           AND (r.negocio_id IS NULL OR r.negocio_id = $3)
         LIMIT 1`,
        [usuario.id, rolesOrPerms, usuario.negocio_id || null]
      );

      if (result.rows.length > 0) {
        return next();
      }

      if (usuario.rol) {
        const legacyResult = await db.query(
          `SELECT 1
           FROM roles r
           JOIN role_permissions rp ON rp.role_id = r.id
           JOIN permissions p ON p.id = rp.permission_id
           WHERE r.slug = $1
             AND p.slug = ANY($2)
             AND (r.negocio_id IS NULL OR r.negocio_id = $3)
           LIMIT 1`,
          [usuario.rol, rolesOrPerms, usuario.negocio_id || null]
        );

        if (legacyResult.rows.length > 0) {
          return next();
        }
      }

      return res.status(403).json({ message: "Acceso denegado" });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Error de autorización' });
    }
  };
};

// Autorización basada en permisos almacenados en BD (roles/permissions)
// Permite superadmin por defecto sin consultar permisos.
exports.authorizePermission = (permiso, { allowSuperadmin = true } = {}) => {
  return exports.authorize([permiso], { allowSuperadmin });
};