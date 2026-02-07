const express = require('express');
const router = express.Router();
const ventasController = require('../controllers/ventasController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { validate, Joi } = require('../middleware/validate');

const pagoSchema = Joi.object({
	metodo_id: Joi.number().integer().positive().required(),
	monto: Joi.number().positive().required()
});

const productoLineaSchema = Joi.object({
	producto_id: Joi.number().integer().positive().required(),
	cantidad: Joi.number().positive().required(),
	descuento: Joi.number().min(0).optional()
});

const promoItemSchema = Joi.object({
	producto_id: Joi.number().integer().positive().required(),
	cantidad: Joi.number().positive().required()
});

const promoSchema = Joi.object({
	promocion_id: Joi.number().integer().positive().required(),
	cantidad: Joi.number().positive().default(1),
	items: Joi.array().items(promoItemSchema).default([])
});

const createVentaSchema = Joi.object({
	productos: Joi.array().items(productoLineaSchema).default([]),
	pagos: Joi.array().items(pagoSchema).default([]),
	promociones: Joi.array().items(promoSchema).default([]),
	cliente_id: Joi.number().integer().positive().allow(null),
	emit_comprobante: Joi.boolean().optional(),
	tipo_comprobante: Joi.string().trim().max(50).allow(null, ''),
	turno_aplicado: Joi.any(),
	descuento_monto: Joi.number().min(0).default(0),
	descuento_porcentaje: Joi.number().min(0).max(100).default(0),
	cupon_codigo: Joi.string().trim().max(100).allow(null, ''),
	cupon_monto: Joi.number().min(0).default(0),
	adicional_manual: Joi.number().min(0).default(0),
	paga_con: Joi.number().min(0).allow(null),
	vuelto: Joi.number().min(0).default(0),
	cobrado: Joi.boolean().default(true),
	observaciones: Joi.string().max(500).allow(null, ''),
	empleado_id: Joi.number().integer().positive().allow(null),
	local_id: Joi.number().integer().positive().allow(null)
}).custom((value, helpers) => {
	if ((!value.productos || value.productos.length === 0) && (!value.promociones || value.promociones.length === 0)) {
		return helpers.error('any.custom', { message: 'Debe enviar productos o promociones' });
	}
	if (value.cobrado && (!value.pagos || value.pagos.length === 0)) {
		return helpers.error('any.custom', { message: 'Debe enviar pagos si cobrado es true' });
	}
	return value;
});

const updateCobroSchema = Joi.object({
	cobrado: Joi.boolean().required(),
	pagos: Joi.array().items(pagoSchema).default([]),
	observaciones: Joi.string().max(500).allow(null, ''),
	empleado_id: Joi.number().integer().positive().allow(null),
	paga_con: Joi.number().min(0).allow(null),
	vuelto: Joi.number().min(0).default(0)
}).custom((value, helpers) => {
	if (value.cobrado && (!value.pagos || value.pagos.length === 0)) {
		return helpers.error('any.custom', { message: 'Debe enviar pagos si cobrado es true' });
	}
	return value;
});

// Crear venta → roles operativos del POS (superadmin no accede a locales)
router.post('/', authenticate, authorize(['pos:venta:create']), validate(createVentaSchema), ventasController.create);

// Feed para el POS (ventas del día con items/pagos)
router.get('/pos-feed', authenticate, authorize(['pos:read']), ventasController.posFeed);

// Actualizar cobro de venta pendiente/parcial
router.patch('/:id/cobro', authenticate, authorize(['pos:venta:edit']), validate(updateCobroSchema), ventasController.updateCobro);

// Listar todas las ventas → admin y superadmin
router.get('/', authenticate, authorize(['reportes:ventas']), ventasController.getAll);

// Listar ventas agrupadas → admin y superadmin
router.get('/grouped', authenticate, authorize(['reportes:ventas']), ventasController.getGrouped);

// Obtener venta por ID → admin y superadmin
router.get('/:id', authenticate, authorize(['reportes:ventas']), ventasController.getById);

// Anular venta → admin y superadmin
router.post('/:id/cancel', authenticate, authorize(['pos:venta:anular']), ventasController.cancel);

module.exports = router;