const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');
const alertasController = require('../controllers/alertasController');

// Solo visualización en pantalla, sin envíos externos
router.get('/', authenticate, authorize(['dashboard:alertas-card']), alertasController.getAlertas);

module.exports = router;
