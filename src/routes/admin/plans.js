const express = require('express');
const router = express.Router();
const plansController = require('../../controllers/admin/plansController');
const { authenticate, authorize } = require('../../middleware/authMiddleware');

router.post('/', authenticate, authorize(['superadmin']), plansController.create);
router.get('/', authenticate, authorize(['superadmin']), plansController.list);
router.get('/:id', authenticate, authorize(['superadmin']), plansController.getById);
router.put('/:id', authenticate, authorize(['superadmin']), plansController.update);
router.delete('/:id', authenticate, authorize(['superadmin']), plansController.remove);

module.exports = router;
