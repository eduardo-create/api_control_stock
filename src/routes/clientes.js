const express = require('express');
const router = express.Router();
const clientesController = require('../controllers/clientesController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// Listar clientes → vendedor, admin y superadmin
router.get('/', authenticate, authorize(['clientes:read']), clientesController.getAll);

// Crear cliente → vendedor, admin y superadmin
// Body esperado: { nombre, email, telefono, dni, direccion, local_id }
router.post('/', authenticate, authorize(['clientes:create']), clientesController.create);

// Obtener cliente por ID → vendedor, admin y superadmin
router.get('/:id', authenticate, authorize(['clientes:read']), clientesController.getById);

// Actualizar cliente → vendedor, admin y superadmin
router.put('/:id', authenticate, authorize(['clientes:update']), clientesController.update);

// Eliminar cliente → solo admin y superadmin
router.delete('/:id', authenticate, authorize(['clientes:delete']), clientesController.remove);

module.exports = router;
