
const express = require('express');
const router = express.Router();
const rolesController = require('../controllers/rolesController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// CRUD roles personalizados
router.post('/', authenticate, authorize(['usuarios:read']), rolesController.createRole);
router.put('/:id', authenticate, authorize(['usuarios:read']), rolesController.updateRole);
router.delete('/:id', authenticate, authorize(['usuarios:read']), rolesController.deleteRole);

// Listar roles base permitidos para crear roles personalizados
router.get('/base-roles', authenticate, authorize(['usuarios:read']), rolesController.listBaseRoles);

// Listar roles disponibles para el negocio
router.get('/', authenticate, authorize(['usuarios:read']), rolesController.listRoles);

module.exports = router;
