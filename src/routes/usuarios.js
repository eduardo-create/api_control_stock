
const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuariosController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
// Resetear contraseña de usuario
router.put('/:id/password', authenticate, authorize(['usuarios:reset-password']), usuariosController.updatePassword);

// Crear usuario → admin y superadmin
router.post('/', authenticate, authorize(['usuarios:create']), usuariosController.create);

// Listar usuarios → admin y superadmin
router.get('/', authenticate, authorize(['usuarios:read']), usuariosController.getAll);

// Obtener usuario por ID → admin y superadmin
router.get('/:id', authenticate, authorize(['usuarios:read']), usuariosController.getById);

// Actualizar usuario → admin y superadmin
router.put('/:id', authenticate, authorize(['usuarios:update']), usuariosController.update);

// Eliminar usuario → admin y superadmin
router.delete('/:id', authenticate, authorize(['usuarios:delete']), usuariosController.remove);

module.exports = router;