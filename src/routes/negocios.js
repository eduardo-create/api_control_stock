// Permisos disponibles para el usuario actual en el negocio
const express = require('express');
const router = express.Router();


const negociosController = require('../controllers/negociosController');
const { authenticate, authorizePermission } = require('../middleware/authMiddleware');


// Bloquear acceso a superadmin a rutas de negocio (excepto endpoints SaaS admin)
router.use(authenticate, (req, res, next) => {
  // Permitir superadmin solo en endpoints SaaS admin (root /, /asignar-admin, /create, /delete, /update, /change-state, /logs, /reset-admin-password, /admins)
  // Bloquear superadmin en endpoints de negocio (usuarios-operativos)
  if (req.usuario && req.usuario.rol === 'superadmin') {
    // Permitir solo en rutas raíz, asignar-admin y logs (GET)
    const allowed = (
      (req.method === 'GET' && (req.path === '/' || req.path.match(/^\/\d+\/logs$/) || req.path.match(/^\/\d+\/admins$/))) ||
      (req.method === 'POST' && req.path === '/') ||
      (req.method === 'POST' && req.path === '/asignar-admin') ||
      (req.method === 'PUT' && req.path.match(/^\/\d+(\/admin\/password|\/estado|\/logs|\/admins)?$/)) ||
      (req.method === 'DELETE' && req.path.match(/^\/\d+$/))
    );
    if (!allowed) {
      return res.status(403).json({ message: 'Acceso denegado para superadmin' });
    }
  }
  next();
});

// Listar negocios: requiere permiso y permite superadmin
router.get('/', authenticate, authorizePermission('negocios:read'), negociosController.getAll);

// Crear negocio / asignar admin: siempre superadmin/permiso
router.post('/', authenticate, authorizePermission('negocios:create'), negociosController.crearNegocio);
router.post('/asignar-admin', authenticate, authorizePermission('negocios:assign-admin'), negociosController.asignarAdministrador);

// Crear usuario operativo → admin del negocio (permiso scoped, superadmin NO permitido)
router.post('/usuarios-operativos', authenticate, (req, res, next) => {
	if (req.usuario && req.usuario.rol === 'superadmin') {
		return res.status(403).json({ message: 'Acceso denegado para superadmin' });
	}
	next();
}, authorizePermission('usuarios-operativos:create', { allowSuperadmin: false }), negociosController.crearUsuarioOperativo);

// Actualizar negocio → superadmin/permiso
router.put('/:id', authenticate, authorizePermission('negocios:update'), negociosController.updateNegocio);

// Eliminar negocio → superadmin/permiso
router.delete('/:id', authenticate, authorizePermission('negocios:delete'), negociosController.deleteNegocio);

// Cambiar estado
router.put('/:id/estado', authenticate, authorizePermission('negocios:change-state'), negociosController.cambiarEstado);

// Logs de negocio
router.get('/:id/logs', authenticate, authorizePermission('negocios:logs'), negociosController.logs);

// Reset de contraseña del admin del negocio
router.put('/:id/admin/password', authenticate, authorizePermission('negocios:reset-admin-password'), negociosController.resetAdminPassword);

// Listar admins de un negocio
router.get('/:id/admins', authenticate, authorizePermission('negocios:admins', { allowSuperadmin: true }), negociosController.listarAdmins);

// List roles for a business
router.get('/:id/roles', negociosController.listRoles);

// Devuelve todos los permisos disponibles para un negocio
router.get('/:id/permissions/available', authenticate, async (req, res) => {
	try {
		// Puedes filtrar por negocio si lo necesitas, aquí se devuelven todos los permisos
		const result = await require('../db').query('SELECT slug, descripcion FROM permissions');
		res.json(result.rows);
	} catch (err) {
		res.status(500).json({ error: 'Error al obtener permisos' });
	}
});
// List permissions for a business
router.get('/:id/permissions', negociosController.listPermissions);

module.exports = router;