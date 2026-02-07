const express = require('express');
const router = express.Router();
const subsController = require('../../controllers/admin/subscriptionsController');
const { authenticate, authorize } = require('../../middleware/authMiddleware');

router.get('/', authenticate, authorize(['superadmin']), subsController.list);
router.get('/:id', authenticate, authorize(['superadmin']), subsController.getById);
router.post('/', authenticate, authorize(['superadmin']), subsController.create);
router.put('/:id', authenticate, authorize(['superadmin']), subsController.update);

module.exports = router;
