## Estilos

La aplicación utiliza Tailwind CSS como framework de estilos.

### Paleta de colores base
- **Primario:** bg-slate-900, text-white
- **Secundario:** bg-amber-600, text-white
- **Fondo:** bg-white, bg-slate-100
- **Bordes:** border-slate-200
- **Alertas:** bg-amber-600, bg-red-600, bg-green-600
- **Texto:** text-slate-700, text-slate-400

### Lineamientos de diseño
- Usar siempre los estilos base definidos para botones, inputs, tablas y alertas.
- Los botones principales deben ser redondeados, con sombra y transición de color.
- Las alertas y confirmaciones se muestran con toast, nunca con alertas nativas.
- Las tablas deben ser responsivas, con encabezados claros y filas alternadas.
- Inputs y selects deben ser redondeados, con padding generoso y borde suave.
- Los colores y fuentes deben ser consistentes en todas las vistas.
- Para nuevas vistas, tomar como referencia los componentes existentes.

**Ejemplo de botón principal:**
```html
<button class="rounded-xl bg-slate-900 text-white font-semibold px-4 py-2.5 text-sm shadow hover:bg-slate-800 disabled:opacity-60 transition">
	Guardar
</button>
```

**Ejemplo de alerta toast:**
```js
toast.success('Operación realizada');
```

**Nota:** Para cualquier nuevo componente, revisar los estilos base y mantener la coherencia visual.
## Alcance y acciones del Superadmin

El rol de **superadmin** tiene un scope global sobre la plataforma, pero su acceso está restringido a tareas de administración general y soporte, sin acceso directo a la gestión operativa de los negocios. El superadmin NO puede ver ni modificar datos internos de los negocios (productos, ventas, stock, reportes, etc.).

### Acciones permitidas para superadmin:
- Crear, listar, actualizar y eliminar negocios.
- Crear, listar, actualizar y eliminar usuarios globales o de negocio (solo para alta inicial o soporte, sin acceso a datos sensibles del negocio).
- Gestionar roles y permisos globales (definir permisos base, asignar roles a negocios).
- Acceder a reportes globales de uso de la plataforma (no a reportes internos de cada negocio).
- Resetear contraseñas de usuarios.
- Ver y auditar logs de actividad global.
- Configurar planes, suscripciones y límites generales de la plataforma.

### Restricciones del superadmin:
- No puede acceder a la gestión de productos, ventas, stock, reportes internos ni ajustes de precios de los negocios.
- No puede operar en módulos de caja, promociones, compras ni movimientos internos de un negocio.
- No puede realizar acciones operativas reservadas a admin, encargado o usuario de un negocio.

**Nota:** El sistema bloquea explícitamente el acceso del superadmin a rutas de negocio en los middlewares y rutas principales.

# Control Stock App

## Descripción General
Control Stock App es una plataforma integral para la gestión de inventario, ventas, ajustes masivos de precios, reportes y administración de negocios. Está diseñada para comercios que requieren control preciso sobre productos, stock, precios, roles de usuario y reportes financieros.

## Tecnologías Utilizadas
- **Backend:** Node.js (Express)
- **Base de datos:** PostgreSQL
- **Frontend:** React (Vite)
- **Autenticación y permisos:** RBAC (roles y permisos)
- **Migraciones:** SQL

## Funcionalidades Principales
- **Gestión de productos:** Alta, baja, modificación, stock, precios, categorías.
- **Ajuste masivo de precios:** Permite modificar precios por porcentaje o valor fijo, filtrar por categoría, registrar historial y revertir ajustes.
- **Reportes:** Stock, ventas, productos por cliente, promociones, caja, ajustes de stock.
- **Roles y permisos:** Superadmin, admin, encargado, usuario. Cada rol tiene acceso a diferentes módulos y acciones.
- **Locales:** Soporte multi-local, cada negocio puede tener varios locales.
- **Alertas:** Notificaciones de stock bajo, ruptura de stock, movimientos relevantes.
- **Historial:** Registro de todas las operaciones relevantes (ajustes, ventas, movimientos).

## Estructura del Proyecto
- **migrations/**: Migraciones SQL para estructura de base de datos.
- **src/**: Lógica backend (controllers, models, routes, utils).
- **web/**: Frontend React (componentes, configuración, estilos).
- **__tests__/**: Pruebas automatizadas.
- **docs/**: Documentación funcional y técnica.

## Flujo de Roles y Permisos
- Los usuarios se asocian a un negocio y pueden tener uno o más roles.
- Los roles determinan el acceso a módulos y acciones (ej: ventas, reportes, ajustes).
- El sistema utiliza tablas: `usuarios`, `roles`, `user_roles`, `permissions`, `role_permissions`.

## Ajuste Masivo de Precios
- Permite aplicar cambios a todos los productos o por categoría.
- Registra cada ajuste en la tabla `ajustes_precios` y el detalle en `ajustes_precios_detalle`.
- Los ajustes pueden ser revertidos desde el historial.
- El historial es visible en el frontend y auditable.

## Reportes
- Los reportes filtran siempre por negocio, evitando que un negocio vea datos de otro.
- Incluye reportes de stock, ventas, productos por cliente, promociones, caja, ajustes de stock.

## Seguridad
- Todas las operaciones filtran por negocio_id.
- Los endpoints y reportes respetan el scope del usuario.

## Diseño y UX
- El frontend utiliza un sistema de diseño consistente (botones, alertas, tablas).
- Confirmaciones y alertas se manejan con toast, evitando alertas nativas.

## Migraciones Relevantes
- `ajustes_precios.sql`: Estructura para ajustes masivos y su detalle.
- Otras migraciones para roles, permisos, productos, locales, ventas.

## Pruebas
- Pruebas automatizadas para control de stock, ajustes, reportes, roles y permisos.

## Documentación
- Documentación funcional en `docs/`.
- Código comentado y modular.


## Instrucciones detalladas de la API

### Productos
- `GET /api/productos` — Listar productos (requiere permisos `productos:read`).
- `POST /api/productos` — Crear producto (requiere `productos:create`). Body: `{ nombre, precio, stock_total, categorias: [idCategoria] }`.
- `GET /api/productos/:id` — Obtener producto por ID (`productos:read`).
- `PUT /api/productos/:id` — Actualizar producto (`productos:update`). Body igual a creación.
- `DELETE /api/productos/:id` — Eliminar producto (`productos:delete`).
- `POST /api/productos/:id/ajuste` — Ajuste manual de stock (`productos:ajuste`). Body: `{ cantidad, motivo }`.
- `POST /api/productos/ajuste-masivo` — Ajuste masivo de precios (`productos:update`). Body: `{ tipo_ajuste: 'porcentaje'|'valor', valor, categoria_id, observacion }`.
- `POST /api/productos/ajuste-masivo/:id/revertir` — Revertir ajuste masivo.
- `GET /api/productos/ajuste-masivo/historial` — Historial de ajustes masivos.

### Usuarios
- `POST /api/usuarios` — Crear usuario (`usuarios:create`).
- `GET /api/usuarios` — Listar usuarios (`usuarios:read`).
- `GET /api/usuarios/:id` — Obtener usuario por ID (`usuarios:read`).
- `PUT /api/usuarios/:id` — Actualizar usuario (`usuarios:update`).
- `DELETE /api/usuarios/:id` — Eliminar usuario (`usuarios:delete`).
- `PUT /api/usuarios/:id/password` — Resetear contraseña (`usuarios:reset-password`).

### Roles
- `POST /api/roles` — Crear rol personalizado (`usuarios:read`).
- `PUT /api/roles/:id` — Actualizar rol personalizado (`usuarios:read`).
- `DELETE /api/roles/:id` — Eliminar rol personalizado (`usuarios:read`).
- `GET /api/roles/base-roles` — Listar roles base (`usuarios:read`).
- `GET /api/roles` — Listar roles del negocio (`usuarios:read`).

### Reportes
- `GET /api/reportes/stock` — Reporte de stock (`reportes:stock`). Query: `local_id`, `formato`, `desde`, `hasta`.
- `GET /api/reportes/stock-ajustes` — Ajustes de stock (`reportes:stock-ajustes`). Query: `local_id`, `producto_id`, `formato`, `desde`, `hasta`.
- `GET /api/reportes/ventas` — Reporte de ventas (`reportes:ventas`).
- `GET /api/reportes/ventas-periodo` — Ventas por período (`reportes:ventas`). Query: `desde`, `hasta`, `local_id`, `turno_id`, `turno`, `agrupar`, `formato`.
- `GET /api/reportes/ventas-cliente` — Ventas por cliente (`reportes:ventas-cliente`). Query: `desde`, `hasta`, `cliente_id`, `local_id`, `formato`.
- `GET /api/reportes/productos-cliente` — Producto más comprado por cliente (`reportes:productos-cliente`). Query: `desde`, `hasta`, `cliente_id`, `local_id`, `formato`.
- `GET /api/reportes/promociones` — Promociones más vendidas (`reportes:promociones`). Query: `desde`, `hasta`, `local_id`, `formato`.
- `GET /api/reportes/promociones-clientes` — Clientes que más compran promociones (`reportes:promociones-clientes`). Query: igual anterior.
- `GET /api/reportes/caja/:turno_id` — Reporte de caja por turno (`reportes:caja`).
- `GET /api/reportes/caja` — Reporte de caja por fechas (`reportes:caja`).
- `GET /api/reportes/kpis` — KPIs (`dashboard:kpis`). Query: `desde`, `hasta`.
- `GET /api/reportes/turnos` — Reporte de turnos (`reportes:turnos`).
- `GET /api/reportes/cierre` — Cierre diario/mensual (`reportes:cierre`). Query: `desde`, `hasta`, `turno_id`, `local_id`, `agrupar`.

**Notas:**
- Todos los endpoints requieren autenticación y filtran por negocio_id del usuario.
- Los permisos se controlan por rol y acción.
- Los parámetros de query y body deben respetar los tipos y validaciones indicadas.

Para más detalles, consultar la documentación interna o los archivos de rutas/controllers.


