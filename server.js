const app = require('./src/app'); // Importa la configuración de Express desde app.js

// Puerto configurable por variable de entorno o por defecto 3000
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT} 🚀`);
});