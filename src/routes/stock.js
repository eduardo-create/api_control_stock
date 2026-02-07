const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');

const { authenticate, authorize } = require('../middleware/authMiddleware');

// Bloquear acceso a superadmin a rutas de negocio
router.use(authenticate, (req, res, next) => {
	if (req.usuario && req.usuario.rol === 'superadmin') {
		return res.status(403).json({ message: 'Acceso denegado para superadmin' });
	}
	next();
});

// Consultar stock de un local → vendedor y admin del negocio (superadmin no accede)
router.get('/:local_id', authenticate, authorize(['productos:read']), stockController.getByLocal);

// Movimientos de stock → admin y superadmin
router.get('/movimientos/:local_id', authenticate, authorize(['reportes:stock']), stockController.getMovimientos);

// Movimientos agrupados → admin y superadmin
router.get('/movimientos/grouped/:local_id', authenticate, authorize(['reportes:stock']), stockController.getMovimientosGrouped);

// Resumen de stock → admin y superadmin
router.get('/resumen/:local_id', authenticate, authorize(['reportes:stock']), stockController.getResumen);

// Ajuste de stock → solo admin y superadmin
router.post('/ajuste', authenticate, authorize(['productos:ajuste']), stockController.ajusteStock);

module.exports = router;