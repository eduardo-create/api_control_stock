// Middleware para CSP relajada solo en Swagger UI
module.exports = function swaggerCsp(req, res, next) {
  // Solo aplica a la ruta de Swagger UI
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; connect-src 'self' http://localhost:3000 ws://localhost:3000; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;");
  next();
};
