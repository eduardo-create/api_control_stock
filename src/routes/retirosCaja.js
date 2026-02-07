const express = require('express');
const router = express.Router();
const retirosCajaController = require('../controllers/retirosCajaController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// Registrar un retiro de caja → admin y superadmin
router.post('/', authenticate, authorize(['caja:movimientos:create']), retirosCajaController.create);

// Listar retiros de un turno → admin y superadmin
router.get('/:turno_id', authenticate, authorize(['caja:movimientos:read']), retirosCajaController.getByTurno);

module.exports = router;