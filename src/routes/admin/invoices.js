const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../middleware/authMiddleware');
const invoicesController = require('../../controllers/admin/invoicesController');

router.get('/pending', authenticate, authorize(['superadmin']), invoicesController.listPending);
router.post('/:id/confirm', authenticate, authorize(['superadmin']), invoicesController.confirm);

module.exports = router;
