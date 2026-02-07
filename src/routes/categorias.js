const express = require('express');
const router = express.Router();
const categoriasController = require('../controllers/categoriasController');

const { authenticate, authorize } = require('../middleware/authMiddleware');

// Bloquear acceso a superadmin a rutas de negocio
router.use(authenticate, (req, res, next) => {
	if (req.usuario && req.usuario.rol === 'superadmin') {
		return res.status(403).json({ message: 'Acceso denegado para superadmin' });
	}
	next();
});

// Crear categoría → solo admin y superadmin
// Body esperado: { nombre, orden }
router.post('/', authenticate, authorize(['categorias:create']), categoriasController.createCategoria);

// Listar categorías → accesible para roles operativos en POS
router.get('/', authenticate, authorize(['categorias:read']), categoriasController.getCategorias);

// Actualizar categoría → solo admin y superadmin
// Body esperado: { nombre, orden, estado }
router.put('/:id', authenticate, authorize(['categorias:update']), categoriasController.updateCategoria);

// Eliminar categoría → solo admin y superadmin
router.delete('/:id', authenticate, authorize(['categorias:delete']), categoriasController.deleteCategoria);

module.exports = router;