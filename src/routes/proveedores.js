const express = require('express');
const router = express.Router();
const proveedoresController = require('../controllers/proveedoresController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.post('/', authenticate, authorize(['proveedores:create']), proveedoresController.create);
router.get('/', authenticate, authorize(['proveedores:read']), proveedoresController.getAll);
router.get('/:id', authenticate, authorize(['proveedores:read']), proveedoresController.getOne);
router.put('/:id', authenticate, authorize(['proveedores:update']), proveedoresController.update);
router.patch('/:id/toggle', authenticate, authorize(['proveedores:update']), proveedoresController.toggleEstado);

module.exports = router;
