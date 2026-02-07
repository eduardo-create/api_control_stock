const express = require('express');
const router = express.Router();
const metodosPagoController = require('../controllers/metodosPagoController');

const { authenticate, authorize } = require('../middleware/authMiddleware');

// Bloquear acceso a superadmin a rutas de negocio
router.use(authenticate, (req, res, next) => {
	if (req.usuario && req.usuario.rol === 'superadmin') {
		return res.status(403).json({ message: 'Acceso denegado para superadmin' });
	}
	next();
});

// Crear método de pago → admin y superadmin
router.post('/', authenticate, authorize(['metodos-pago:create']), metodosPagoController.create);

// Listar métodos de pago → roles operativos del negocio (sin superadmin)
router.get('/', authenticate, authorize(['metodos-pago:read']), metodosPagoController.getAll);

// Obtener método de pago por ID → admin y superadmin
router.get('/:id', authenticate, authorize(['metodos-pago:read']), metodosPagoController.getById);

// Actualizar método de pago → admin y superadmin
router.put('/:id', authenticate, authorize(['metodos-pago:update']), metodosPagoController.update);

// Eliminar método de pago → admin y superadmin
router.delete('/:id', authenticate, authorize(['metodos-pago:delete']), metodosPagoController.remove);

module.exports = router;