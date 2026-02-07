const express = require('express');
const router = express.Router();
const facturacionController = require('../controllers/facturacionController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// Crear comprobante (esqueleto) → admin/superadmin
router.post('/', authenticate, authorize(['facturacion:create']), facturacionController.createComprobante);

// Listar comprobantes → admin/superadmin
router.get('/', authenticate, authorize(['facturacion:read']), facturacionController.list);

// Obtener comprobante por id → admin/superadmin
router.get('/:id', authenticate, authorize(['facturacion:read']), facturacionController.getById);

module.exports = router;
