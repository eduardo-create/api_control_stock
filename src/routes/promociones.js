const express = require('express');
const router = express.Router();
const promocionesController = require('../controllers/promocionesController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// Todas las rutas son solo para admins de su negocio
router.post('/', authenticate, authorize(['promociones:create']), promocionesController.create);
router.get('/', authenticate, authorize(['promociones:read']), promocionesController.list);
router.get('/:id', authenticate, authorize(['promociones:read']), promocionesController.getById);
router.put('/:id', authenticate, authorize(['promociones:update']), promocionesController.update);
router.delete('/:id', authenticate, authorize(['promociones:delete']), promocionesController.remove);

module.exports = router;
