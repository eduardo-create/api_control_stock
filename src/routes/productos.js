const express = require('express');
const router = express.Router();
const productosController = require('../controllers/productosController');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// Bloquear acceso a superadmin a rutas de negocio
router.use(authenticate, (req, res, next) => {
	if (req.usuario && req.usuario.rol === 'superadmin') {
		return res.status(403).json({ message: 'Acceso denegado para superadmin' });
	}
	next();
});
const { validate, Joi } = require('../middleware/validate');

const productoSchema = Joi.object({
	nombre: Joi.string().trim().min(1).required(),
	precio: Joi.number().min(0).required(),
	stock_total: Joi.number().min(0).required(),
	categorias: Joi.array().items(Joi.number().integer().positive()).default([])
});

const ajusteSchema = Joi.object({
	cantidad: Joi.number().custom((v, helpers) => {
		if (v === 0) return helpers.error('number.notZero');
		return v;
	}).messages({ 'number.notZero': 'cantidad debe ser distinta de cero' }).required(),
	motivo: Joi.string().trim().max(200).allow('', null)
});

// Listar productos → accesible para roles operativos en POS
// Devuelve también las categorías asociadas
router.get('/', authenticate, authorize(['productos:read']), productosController.getAll);

// Crear producto → solo admin
// Body esperado: { nombre, precio, stock_total, categorias: [idCategoria1, idCategoria2] }
router.post('/', authenticate, authorize(['productos:create']), validate(productoSchema), productosController.create);

// Obtener producto por ID → accesible para vendedor, admin y superadmin
router.get('/:id', authenticate, authorize(['productos:read']), productosController.getById);

// Actualizar producto → solo admin
// Body esperado: { nombre, precio, stock_total, categorias: [idCategoria1, idCategoria2] }
router.put('/:id', authenticate, authorize(['productos:update']), validate(productoSchema), productosController.update);

// Ajuste manual de stock → solo admin
router.post('/:id/ajuste', authenticate, authorize(['productos:ajuste']), validate(ajusteSchema), productosController.ajustarStock);

// Ajuste masivo de precios → solo admin
// Body esperado: { tipo_ajuste: 'porcentaje'|'valor', valor: number, categoria_id: number|null, observacion: string|null }
router.post('/ajuste-masivo', authenticate, authorize(['productos:update']), productosController.ajusteMasivoPrecios);

// Revertir ajuste masivo de precios
router.post('/ajuste-masivo/:id/revertir', authenticate, productosController.revertirAjusteMasivo);

// Historial de ajustes masivos de precios
router.get('/ajuste-masivo/historial', authenticate, async (req, res) => {
	const usuario = req.usuario;
	const negocioId = usuario.negocio_id;
	const result = await db.query(
		`SELECT a.*, c.nombre as categoria_nombre
		 FROM ajustes_precios a
		 LEFT JOIN categorias c ON a.categoria_id = c.id
		 WHERE a.negocio_id = $1
		 ORDER BY a.fecha DESC LIMIT 50`,
		[negocioId]
	);
	res.json(result.rows);
});

// Eliminar producto → solo admin
router.delete('/:id', authenticate, authorize(['productos:delete']), productosController.remove);

module.exports = router;