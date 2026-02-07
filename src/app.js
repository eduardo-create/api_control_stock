const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { authenticate } = require('./middleware/authMiddleware');
const { requireActiveSubscription, requireFeature } = require('./middleware/planMiddleware');

const app = express();
app.set('trust proxy', 1);
const RATE_LIMIT_DISABLED = process.env.RATE_LIMIT_DISABLED === 'true';
const FRONTEND_ORIGINS = process.env.FRONTEND_ORIGINS || 'http://localhost:5173';
const allowedOrigins = FRONTEND_ORIGINS.split(',').map(o => o.trim()).filter(Boolean);
const devRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const lanRegex = /^https?:\/\/(192\.168\.[0-9]{1,3}\.[0-9]{1,3}|10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|172\.(1[6-9]|2[0-9]|3[0-1])\.[0-9]{1,3}\.[0-9]{1,3})(:\d+)?$/;

// Middleware para manejar preflight (OPTIONS) y CORS de forma explícita
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (
    !origin ||
    allowedOrigins.includes(origin) ||
    devRegex.test(origin) ||
    lanRegex.test(origin)
  ) {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
  }
  next();
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => RATE_LIMIT_DISABLED
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => RATE_LIMIT_DISABLED
});

// ===============================
// Middlewares
// ===============================
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/api', generalLimiter);

// ===============================
// Importar rutas
// ===============================
const productosRoutes = require('./routes/productos');
const ventasRoutes = require('./routes/ventas');
const stockRoutes = require('./routes/stock');
const cajaRoutes = require('./routes/caja');
const negociosRoutes = require('./routes/negocios'); // Importing negocios routes
const proveedoresRoutes = require('./routes/proveedores');
const pagosRoutes = require('./routes/pagos');
const metodosPagoRoutes = require('./routes/metodosPago');
const categoriasRoutes = require('./routes/categorias');
const authRoutes = require('./routes/auth');
const subscriptionSelfRoutes = require('./routes/subscription');
const comprasRoutes = require('./routes/compras');
const insumosRoutes = require('./routes/insumos');
const clientesRoutes = require('./routes/clientes');
const facturacionRoutes = require('./routes/facturacion');
const adminPlansRoutes = require('./routes/admin/plans');
const adminSubsRoutes = require('./routes/admin/subscriptions');
const adminInvoicesRoutes = require('./routes/admin/invoices');
const adminChangelogRoutes = require('./routes/admin/changelog');
const usuariosRoutes = require('./routes/usuarios');
const localesRoutes = require('./routes/locales');
const reportesRoutes = require('./routes/reportes');
const turnosRoutes = require('./routes/turnos');
const promocionesRoutes = require('./routes/promociones');
const empleadosRoutes = require('./routes/empleados');
const alertasRoutes = require('./routes/alertas');
const permissionsRoutes = require('./routes/permissions');
const rolesRoutes = require('./routes/roles');
let swaggerUi;
let swaggerSpec;
let swaggerCsp;
try {
  swaggerUi = require('swagger-ui-express');
  swaggerSpec = require('./swagger');
  swaggerCsp = require('./middleware/swaggerCsp');
} catch (e) {
  console.error('Error al requerir Swagger UI o dependencias:', e);
  swaggerUi = null;
  swaggerSpec = null;
  swaggerCsp = null;
}


// Helper para reutilizar el middleware de plan/features por módulo
const planGate = (feature) => [authenticate, requireActiveSubscription, requireFeature(feature)];

// ===============================
// Montar rutas con prefijo
// ===============================
app.use('/api/productos', ...planGate('productos'), productosRoutes);
app.use('/api/ventas', ...planGate('ventas'), ventasRoutes);
app.use('/api/stock', ...planGate('stock'), stockRoutes);
app.use('/api/caja', ...planGate('caja'), cajaRoutes);
app.use('/api/negocios', negociosRoutes); // Mounting negocios routes
app.use('/api/proveedores', ...planGate('proveedores'), proveedoresRoutes);
app.use('/api/pagos', ...planGate('pagos'), pagosRoutes);
app.use('/api/metodos-pago', ...planGate('metodos_pago'), metodosPagoRoutes);
app.use('/api/categorias', ...planGate('categorias'), categoriasRoutes);
app.use('/api/auth', authLimiter, authRoutes);
// Info de suscripción propia: accesible aunque el plan esté inactivo
app.use('/api/subscription', authenticate, subscriptionSelfRoutes);
app.use('/api/compras', ...planGate('compras'), comprasRoutes);
app.use('/api/insumos', ...planGate('insumos'), insumosRoutes);
app.use('/api/clientes', ...planGate('clientes'), clientesRoutes);
app.use('/api/facturacion', ...planGate('facturacion'), facturacionRoutes);
app.use('/api/admin/plans', adminPlansRoutes);
app.use('/api/admin/subscriptions', adminSubsRoutes);
app.use('/api/admin/invoices', adminInvoicesRoutes);
app.use('/api/admin/changelog', adminChangelogRoutes);
app.use('/api/usuarios', ...planGate('usuarios'), usuariosRoutes);
app.use('/api/locales', ...planGate('locales'), localesRoutes);
app.use('/api/reportes', ...planGate('reportes'), reportesRoutes);
app.use('/api/negocios/:negocioId/permissions', permissionsRoutes); // Added line for permissions endpoint
app.use('/api/turnos', ...planGate('turnos'), turnosRoutes);
app.use('/api/promociones', ...planGate('promociones'), promocionesRoutes);
app.use('/api/empleados', ...planGate('empleados'), empleadosRoutes);
app.use('/api/alertas', ...planGate('alertas'), alertasRoutes);
app.use('/api/roles', rolesRoutes);

// Documentación Swagger (si está disponible)
console.log('SwaggerUi:', !!swaggerUi, 'SwaggerSpec:', !!swaggerSpec, 'SwaggerCsp:', !!swaggerCsp);
if (swaggerUi && swaggerSpec && swaggerCsp) {
  console.log('Montando Swagger UI en /api/docs');
  app.use('/api/docs', swaggerCsp, swaggerUi.serve, swaggerUi.setup(swaggerSpec));
} else {
  console.log('NO se montó Swagger UI');
}


// ===============================
// Ruta base
// ===============================
app.get('/', (req, res) => {
  res.send('API funcionando correctamente 🚀');
});

// ===============================
// Exportar app
// ===============================
module.exports = app;