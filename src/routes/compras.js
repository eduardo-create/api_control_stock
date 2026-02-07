const express = require('express');
const router = express.Router();
const comprasController = require('../controllers/comprasController');

const { authenticate, authorize } = require('../middleware/authMiddleware');

// Bloquear acceso a superadmin a rutas de negocio
router.use(authenticate, (req, res, next) => {
	if (req.usuario && req.usuario.rol === 'superadmin') {
		return res.status(403).json({ message: 'Acceso denegado para superadmin' });
	}
	next();
});

// Registrar compra
router.post('/', authenticate, authorize(['compras:create']), comprasController.create);

// Listar compras
router.get('/', authenticate, authorize(['compras:read']), comprasController.getAll);

module.exports = router;
