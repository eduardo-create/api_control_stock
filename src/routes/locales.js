const express = require('express');
const router = express.Router();
const localesController = require('../controllers/localesController');

const { authenticate, authorize } = require('../middleware/authMiddleware');

// Bloquear acceso a superadmin a rutas de negocio
router.use(authenticate, (req, res, next) => {
	if (req.usuario && req.usuario.rol === 'superadmin') {
		return res.status(403).json({ message: 'Acceso denegado para superadmin' });
	}
	next();
});

// Crear local
router.post('/', authenticate, authorize(['locales:create']), localesController.create);

// Listar locales
router.get('/', authenticate, authorize(['locales:read']), localesController.getAll);

// Obtener local por ID
router.get('/:id', authenticate, authorize(['locales:read']), localesController.getById);

// Actualizar local
router.put('/:id', authenticate, authorize(['locales:update']), localesController.update);

// Eliminar local
router.delete('/:id', authenticate, authorize(['locales:delete']), localesController.remove);

module.exports = router;