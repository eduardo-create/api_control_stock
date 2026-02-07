const express = require('express');
const router = express.Router();
const changelogController = require('../../controllers/admin/changelogController');
const { authenticate, authorize } = require('../../middleware/authMiddleware');

// Listar (admins y superadmin)
router.get('/', authenticate, authorize(['admin', 'superadmin']), changelogController.list);

// CRUD solo superadmin
router.post('/', authenticate, authorize(['superadmin']), changelogController.create);
router.put('/:id', authenticate, authorize(['superadmin']), changelogController.update);
router.delete('/:id', authenticate, authorize(['superadmin']), changelogController.remove);

module.exports = router;
