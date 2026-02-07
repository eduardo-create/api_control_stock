const express = require('express');
const router = express.Router();
const reportesController = require('../controllers/reportesController');

const { authenticate, authorize } = require('../middleware/authMiddleware');

// Bloquear acceso a superadmin a rutas de negocio
router.use(authenticate, (req, res, next) => {
	if (req.usuario && req.usuario.rol === 'superadmin') {
		return res.status(403).json({ message: 'Acceso denegado para superadmin' });
	}
	next();
});
const { validate, Joi } = require('../middleware/validate');

const dateParam = Joi.string().isoDate();

const stockQuery = Joi.object({
	local_id: Joi.number().integer().positive().optional(),
	formato: Joi.string().valid('json', 'excel').optional(),
	desde: dateParam.optional(),
	hasta: dateParam.optional()
});

const stockAjustesQuery = Joi.object({
	local_id: Joi.number().integer().positive().optional(),
	producto_id: Joi.number().integer().positive().optional(),
	formato: Joi.string().valid('json', 'excel').optional(),
	desde: dateParam.optional(),
	hasta: dateParam.optional()
});

const ventasPeriodoQuery = Joi.object({
	desde: dateParam.required(),
	hasta: dateParam.required(),
	local_id: Joi.number().integer().positive().optional(),
	turno_id: Joi.number().integer().positive().optional(),
	turno: Joi.string().trim().max(100).optional(),
	agrupar: Joi.string().valid('dia', 'mes', 'anio', 'año').optional(),
	formato: Joi.string().valid('json', 'excel').optional()
});

const ventasClienteQuery = Joi.object({
	desde: dateParam.optional(),
	hasta: dateParam.optional(),
	cliente_id: Joi.number().integer().positive().optional(),
	local_id: Joi.number().integer().positive().optional(),
	formato: Joi.string().valid('json', 'excel').optional()
});

const productosClienteQuery = Joi.object({
	desde: dateParam.optional(),
	hasta: dateParam.optional(),
	cliente_id: Joi.number().integer().positive().optional(),
	local_id: Joi.number().integer().positive().optional(),
	formato: Joi.string().valid('json', 'excel').optional()
});

const promosQuery = Joi.object({
	desde: dateParam.optional(),
	hasta: dateParam.optional(),
	local_id: Joi.number().integer().positive().optional(),
	formato: Joi.string().valid('json', 'excel').optional()
});

const cierreQuery = Joi.object({
	desde: dateParam.optional(),
	hasta: dateParam.optional(),
	turno_id: Joi.number().integer().positive().optional(),
	local_id: Joi.number().integer().positive().optional(),
	agrupar: Joi.string().valid('dia', 'mes', 'anio', 'año').optional()
});

const kpisQuery = Joi.object({
	desde: dateParam.optional(),
	hasta: dateParam.optional()
});

// Reporte de ventas
router.get('/ventas', authenticate, authorize(['reportes:ventas']), reportesController.getVentas);

// Reporte de stock
router.get('/stock', authenticate, authorize(['reportes:stock']), validate(stockQuery, 'query'), reportesController.getStock);

// Ajustes de stock
router.get('/stock-ajustes', authenticate, authorize(['reportes:stock-ajustes']), validate(stockAjustesQuery, 'query'), reportesController.getAjustesStock);

//// Reporte financiero
router.get('/financieros', authenticate, authorize(['reportes:financieros']), reportesController.getFinancieros);

// Ventas por período
router.get('/ventas-periodo', authenticate, authorize(['reportes:ventas']), validate(ventasPeriodoQuery, 'query'), reportesController.getVentasPeriodo);

// Ventas por cliente
router.get('/ventas-cliente', authenticate, authorize(['reportes:ventas-cliente']), validate(ventasClienteQuery, 'query'), reportesController.getVentasPorCliente);

// Producto más comprado por cliente
router.get('/productos-cliente', authenticate, authorize(['reportes:productos-cliente']), validate(productosClienteQuery, 'query'), reportesController.getProductosPorCliente);

// Promociones más vendidas
router.get('/promociones', authenticate, authorize(['reportes:promociones']), validate(promosQuery, 'query'), reportesController.getPromosMasVendidas);

// Clientes que más compran promociones
router.get('/promociones-clientes', authenticate, authorize(['reportes:promociones-clientes']), validate(promosQuery, 'query'), reportesController.getClientesPromos);

// Reporte de caja por turno
router.get('/caja/:turno_id', authenticate, authorize(['reportes:caja']), reportesController.getCajaPorTurno);

//// Reporte de caja por rango de fechas
router.get('/caja', authenticate, authorize(['reportes:caja']), reportesController.getCajaPorFechas);

// KPIs
router.get('/kpis', authenticate, authorize(['dashboard:kpis']), validate(kpisQuery, 'query'), reportesController.getKpis);

//// Reporte de turnos con cantidad de comandas
router.get('/turnos', authenticate, authorize(['reportes:turnos']), reportesController.getReporteTurnos);

// Cierre diario/mensual
router.get('/cierre', authenticate, authorize(['reportes:cierre']), validate(cierreQuery, 'query'), reportesController.getCierre);


module.exports = router;