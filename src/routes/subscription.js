const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/authMiddleware');
const subscriptionSelfController = require('../controllers/subscriptionSelfController');

// Admin del negocio puede ver su propia suscripción
router.get('/me', authorize(['subscription:read']), subscriptionSelfController.getMySubscription);

// Reportar un pago (queda pendiente de confirmación por superadmin)
router.post('/me/report-payment', authorize(['subscription:report-payment']), subscriptionSelfController.reportPayment);

module.exports = router;
