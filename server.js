const app = require('./src/app'); // Importa la configuración de Express desde app.js

// Puerto configurable por variable de entorno o por defecto 3000
let PORT = process.env.PORT || 3000;
PORT = parseInt(PORT, 10);
if (isNaN(PORT) || PORT < 0 || PORT > 65535) {
  console.error('PORT variable must be an integer between 0 and 65535');
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT} 🚀`);
});