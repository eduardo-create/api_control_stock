const express = require('express');
const router = express.Router();
const insumosController = require('../controllers/insumosController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// Listar insumos (para compras/stock)
router.get('/', authenticate, authorize(['insumos:read']), insumosController.getAll);

module.exports = router;
