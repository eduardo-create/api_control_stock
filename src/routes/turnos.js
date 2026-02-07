const express = require('express');
const router = express.Router();
const turnosController = require('../controllers/turnosController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// Abrir turno
router.post('/abrir', authenticate, authorize(['caja:open']), turnosController.abrirTurno);

// Cerrar turno
router.put('/cerrar/:id', authenticate, authorize(['caja:close']), turnosController.cerrarTurno);

// Consultar turno actual
router.get('/actual', authenticate, authorize(['caja:read']), turnosController.getTurnoActual);

// Listar turnos históricos (opcional)
router.get('/', authenticate, authorize(['caja:read']), turnosController.getTurnos);

module.exports = router;
