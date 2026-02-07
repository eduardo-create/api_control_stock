const express = require('express');
const router = express.Router();
const cajaController = require('../controllers/cajaController');

const { authenticate, authorize } = require('../middleware/authMiddleware');

// Bloquear acceso a superadmin a rutas de negocio
router.use(authenticate, (req, res, next) => {
	if (req.usuario && req.usuario.rol === 'superadmin') {
		return res.status(403).json({ message: 'Acceso denegado para superadmin' });
	}
	next();
});

router.post('/apertura', authenticate, authorize(['caja:open']), cajaController.apertura);
router.post('/cierre/:turno_id', authenticate, authorize(['caja:close']), cajaController.cierre);
router.get('/resumen/:local_id', authenticate, authorize(['caja:read']), cajaController.resumenDiario);
router.get('/turnos/:local_id', authenticate, authorize(['caja:read']), cajaController.listarTurnos);
router.get('/movimientos/:turno_id', authenticate, authorize(['caja:movimientos:read']), cajaController.listarMovimientosTurno);
router.post('/arqueo/:turno_id', authenticate, authorize(['caja:movimientos:create']), cajaController.arqueoIntermedio);
router.post('/retiro', authenticate, authorize(['caja:movimientos:create']), cajaController.retiroParcial);
router.post('/gasto', authenticate, authorize(['caja:movimientos:create']), cajaController.registrarGasto);


module.exports = router;