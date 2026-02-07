const express = require('express');
const router = express.Router();
const pagosController = require('../controllers/pagosController');
const metodosPagoController = require('../controllers/metodosPagoController');

const { authenticate, authorize } = require('../middleware/authMiddleware');

// Bloquear acceso a superadmin a rutas de negocio
router.use(authenticate, (req, res, next) => {
	if (req.usuario && req.usuario.rol === 'superadmin') {
		return res.status(403).json({ message: 'Acceso denegado para superadmin' });
	}
	next();
});

// ===============================
// Métodos de pago
// ===============================

// Crear un nuevo método de pago (ej: efectivo, tarjeta débito, etc.)
router.post('/metodos', authenticate, authorize(['metodos-pago:create']), metodosPagoController.crearMetodoPago);

// Listar todos los métodos de pago disponibles
router.get('/metodos', authenticate, authorize(['metodos-pago:read']), metodosPagoController.getAll);

// ===============================
// Pagos asociados a ventas
// ===============================

// Registrar un pago para una venta existente (vendedor/admin)
router.post('/', authenticate, authorize(['pagos:create']), pagosController.registrarPago);

// Obtener pagos de una venta específica
router.get('/venta/:venta_id', authenticate, authorize(['pagos:read']), pagosController.getByVentaId);

// Listar pagos (filtros)
router.get('/', authenticate, authorize(['pagos:read']), pagosController.list);

// Obtener pago por id
router.get('/:id', authenticate, authorize(['pagos:read']), pagosController.getById);

// Actualizar pago (admin)
router.put('/:id', authenticate, authorize(['pagos:update']), pagosController.update);

// Eliminar pago (admin)
router.delete('/:id', authenticate, authorize(['pagos:delete']), pagosController.remove);

// Reembolso (admin)
router.post('/:id/refund', authenticate, authorize(['pagos:refund']), pagosController.refund);

module.exports = router;