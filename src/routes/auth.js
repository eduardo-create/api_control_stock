const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validate, Joi } = require('../middleware/validate');

const loginSchema = Joi.object({
	usuario: Joi.string().trim().min(1).required(),
	password: Joi.string().min(4).required()
});

router.post('/login', validate(loginSchema), authController.login);

module.exports = router;