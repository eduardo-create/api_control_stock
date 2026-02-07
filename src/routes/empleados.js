const express = require('express');
const router = express.Router();
const empleadosController = require('../controllers/empleadosController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// Listar
router.get('/', authenticate, authorize(['empleados:read']), empleadosController.getAll);
// Obtener por id
router.get('/:id', authenticate, authorize(['empleados:read']), empleadosController.getById);
// Crear
router.post('/', authenticate, authorize(['empleados:create']), empleadosController.create);
// Actualizar
router.put('/:id', authenticate, authorize(['empleados:update']), empleadosController.update);
// Dar de baja
router.delete('/:id', authenticate, authorize(['empleados:delete']), empleadosController.remove);

module.exports = router;
