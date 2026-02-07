const express = require('express');
const router = express.Router();
const permissionsController = require('../controllers/permissionsController');
const { authenticate } = require('../middleware/authMiddleware');

// Listar permisos del usuario actual
router.get('/', authenticate, permissionsController.listPermissions);

module.exports = router;
