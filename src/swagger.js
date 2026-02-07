const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Control Stock API',
      version: '1.0.0',
      description: 'API REST para un sistema POS: ventas, pagos, stock, turnos y caja.\n\nRoles configurables por negocio: admin (total), cajero (ventas/caja), vendedor (ventas), encargado (reportes/local), consulta (solo lectura). El rol superadmin es exclusivo del sistema SaaS.'
    },
    servers: [{ url: 'http://localhost:3000', description: 'Local server' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [{ bearerAuth: [] }]
  },
  apis: []
};

const swaggerSpec = swaggerJSDoc(options);

swaggerSpec.paths = swaggerSpec.paths || {};
swaggerSpec.components = swaggerSpec.components || {};
swaggerSpec.components.schemas = swaggerSpec.components.schemas || {};
swaggerSpec.components.responses = swaggerSpec.components.responses || {};

// Respuestas comunes para gating por plan/feature
swaggerSpec.components.responses.SubscriptionRequired = {
  description: 'Suscripción inactiva o ausente',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          code: { type: 'string', example: 'subscription_missing' },
          status: { type: 'string', nullable: true },
          plan: { type: 'string', nullable: true },
          trial_end: { type: 'string', format: 'date-time', nullable: true },
          current_period_end: { type: 'string', format: 'date-time', nullable: true }
        }
      }
    }
  }
};

swaggerSpec.components.responses.FeatureBlocked = {
  description: 'El plan no incluye el módulo requerido',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          code: { type: 'string', example: 'feature_blocked' },
          feature: { type: 'string' },
          plan: { type: 'string', nullable: true }
        }
      }
    }
  }
};

// Suscripción propia (admins de negocio)
swaggerSpec.paths['/api/subscription/me'] = {
  get: {
    tags: ['Suscripciones'],
    summary: 'Ver suscripción del negocio actual',
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: 'Información de suscripción y plan' },
      400: { description: 'Negocio no asociado' },
      500: { description: 'Error interno' }
    }
  }
};

swaggerSpec.paths['/api/subscription/me/report-payment'] = {
  post: {
    tags: ['Suscripciones'],
    summary: 'Reportar un pago (pendiente de confirmación)',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              monto: { type: 'number' },
              referencia: { type: 'string', nullable: true },
              fecha_pago: { type: 'string', format: 'date', nullable: true }
            },
            required: ['monto']
          }
        }
      }
    },
    responses: {
      201: { description: 'Pago informado' },
      400: { description: 'Datos inválidos' },
      404: { description: 'Suscripción inexistente' },
      500: { description: 'Error interno' }
    }
  }
};

// Admin: facturas/invoices reportadas
swaggerSpec.paths['/api/admin/invoices/pending'] = {
  get: {
    tags: ['Admin'],
    summary: 'Listar pagos reportados pendientes',
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: 'Listado de invoices pendientes' },
      401: { description: 'No autorizado' }
    }
  }
};

swaggerSpec.paths['/api/admin/invoices/{id}/confirm'] = {
  post: {
    tags: ['Admin'],
    summary: 'Confirmar pago reportado',
    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: 'Pago confirmado y suscripción extendida' },
      400: { description: 'Factura ya pagada' },
      404: { description: 'No encontrada' },
      500: { description: 'Error interno' }
    }
  }
};

// Caja: registrar gasto manual
swaggerSpec.paths['/api/caja/gasto'] = {
  post: {
    tags: ['Caja'],
    summary: 'Registrar un gasto manual en un turno abierto',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              turno_id: { type: 'integer' },
              monto: { type: 'number' },
              descripcion: { type: 'string' }
            },
            required: ['turno_id', 'monto']
          }
        }
      }
    },
    responses: {
      201: { description: 'Gasto registrado' },
      400: { description: 'Datos inválidos' },
      404: { description: 'Turno no encontrado' },
      500: { description: 'Error interno' }
    }
  }
};

swaggerSpec.components.schemas.Proveedor = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    nombre: { type: 'string' },
    cuit: { type: 'string', nullable: true },
    email: { type: 'string', nullable: true },
    telefono: { type: 'string', nullable: true },
    direccion: { type: 'string', nullable: true },
    notas: { type: 'string', nullable: true },
    estado: { type: 'boolean' },
    alias: { type: 'string', nullable: true }
  }
};

swaggerSpec.components.schemas.AjusteStock = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    fecha: { type: 'string', format: 'date-time' },
    local_id: { type: 'integer', nullable: true },
    local: { type: 'string', nullable: true },
    producto_id: { type: 'integer' },
    producto: { type: 'string' },
    cantidad: { type: 'number' },
    stock_prev: { type: 'number', nullable: true },
    stock_nuevo: { type: 'number', nullable: true },
    tipo: { type: 'string' },
    motivo: { type: 'string', nullable: true },
    usuario: { type: 'string', nullable: true }
  }
};

swaggerSpec.components.schemas.Alerta = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    tipo: { type: 'string' },
    severidad: { type: 'string', enum: ['alta', 'media', 'info'] },
    mensaje: { type: 'string' },
    producto: { type: 'string', nullable: true },
    local: { type: 'string', nullable: true },
    meta: { type: 'object', nullable: true },
    created_at: { type: 'string', format: 'date-time' }
  }
};

// Turnos
swaggerSpec.paths['/api/turnos'] = {
  get: {
    tags: ['Turnos'],
    summary: 'Listar turnos (por local, fecha, estado)',
    parameters: [
      { name: 'local_id', in: 'query', schema: { type: 'integer' } },
      { name: 'fecha', in: 'query', schema: { type: 'string', format: 'date' } },
      { name: 'estado', in: 'query', schema: { type: 'string' } }
    ],
    responses: { '200': { description: 'Listado de turnos', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Turno' } } } } }, '403': { description: 'No autorizado' } },
    security: [{ bearerAuth: [] }]
  },
  post: {
    tags: ['Turnos'],
    summary: 'Abrir turno',
    requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/TurnoCreate' } } } },
    responses: { '201': { description: 'Turno abierto', content: { 'application/json': { schema: { $ref: '#/components/schemas/Turno' } } } } },
    security: [{ bearerAuth: [] }]
  }
};

swaggerSpec.paths['/api/turnos/{id}/cerrar'] = {
  post: {
    tags: ['Turnos'],
    summary: 'Cerrar turno',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
    requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { saldo_final: { type: 'number' } }, required: ['saldo_final'] } } } },
    responses: { '200': { description: 'Turno cerrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Turno' } } } }, '404': { description: 'No encontrado' } },
    security: [{ bearerAuth: [] }]
  }
};

// Reportes
swaggerSpec.paths['/api/reportes/cierre'] = {
  get: {
    tags: ['Reportes'],
    summary: 'Reporte de cierre diario/mensual',
    description: 'Devuelve cierre por turno o agrupado por día con desglose de ventas, pagos, gastos y cierres. Solo admins.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { in: 'query', name: 'desde', schema: { type: 'string', format: 'date' }, description: 'Fecha inicio YYYY-MM-DD' },
      { in: 'query', name: 'hasta', schema: { type: 'string', format: 'date' }, description: 'Fecha fin YYYY-MM-DD' },
      { in: 'query', name: 'turno_id', schema: { type: 'integer' }, description: 'Filtrar por turno específico' },
      { in: 'query', name: 'local_id', schema: { type: 'integer' }, description: 'Filtrar por local' },
      { in: 'query', name: 'agrupar', schema: { type: 'string', enum: ['dia'] }, description: 'Si vale "dia", agrupa por día en lugar de por turno' }
    ],
    responses: {
      200: {
        description: 'Listado de cierres',
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  fecha: { type: 'string', format: 'date-time' },
                  hora: { type: 'string', format: 'date-time' },
                  turno_id: { type: 'integer', nullable: true },
                  total_pedidos: { type: 'integer' },
                  inicio_caja: { type: 'number' },
                  total_ventas: { type: 'number' },
                  pagos_por_metodo: { type: 'object', additionalProperties: { type: 'number' } },
                  total_gastos: { type: 'number' },
                  sueldos: { type: 'number' },
                  neto_dia: { type: 'number' },
                  total_ingresos: { type: 'number' },
                  total_egresos: { type: 'number' },
                  cierre_teorico: { type: 'number' },
                  cierre_real: { type: 'number', nullable: true },
                  diferencia: { type: 'number', nullable: true },
                  fecha_cierre: { type: 'string', format: 'date-time', nullable: true },
                  hora_cierre: { type: 'string', format: 'date-time', nullable: true },
                  usuario_cierre: { type: 'integer', nullable: true },
                  empleado: { type: 'string', nullable: true },
                  turnos: { type: 'array', items: { type: 'integer' }, nullable: true }
                }
              }
            }
          }
        }
      },
      401: { description: 'No autorizado' }
    }
  }
};

swaggerSpec.paths['/api/reportes/ventas-periodo'] = {
  get: {
    tags: ['Reportes'],
    summary: 'Ventas por período (día/mes/año)',
    description: 'Exporta ventas agregadas por día, mes o año con desglose de pagos. Solo admins.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { in: 'query', name: 'desde', schema: { type: 'string', format: 'date' }, required: true, description: 'Fecha inicio YYYY-MM-DD' },
      { in: 'query', name: 'hasta', schema: { type: 'string', format: 'date' }, required: true, description: 'Fecha fin YYYY-MM-DD' },
      { in: 'query', name: 'local_id', schema: { type: 'integer' }, description: 'Filtrar por local' },
      { in: 'query', name: 'turno_id', schema: { type: 'integer' }, description: 'Filtrar por turno (id)' },
      { in: 'query', name: 'turno', schema: { type: 'string', enum: ['Turno mañana', 'Turno tarde'] }, description: 'Filtrar por nombre de turno' },
      { in: 'query', name: 'agrupar', schema: { type: 'string', enum: ['dia', 'mes', 'anio'] }, description: 'Granularidad: día (default), mes, año' },
      { in: 'query', name: 'formato', schema: { type: 'string', enum: ['excel'] }, description: 'Formato de salida. Solo excel.' }
    ],
    responses: {
      200: { description: 'Archivo Excel con el detalle' },
      400: { description: 'Parámetros inválidos' },
      401: { description: 'No autorizado' }
    }
  }
};

swaggerSpec.paths['/api/reportes/ventas-cliente'] = {
  get: {
    tags: ['Reportes'],
    summary: 'Ventas agrupadas por cliente',
    description: 'Agrupa ventas por cliente en el rango indicado. El cliente es opcional al registrar la venta.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { in: 'query', name: 'desde', schema: { type: 'string', format: 'date' }, description: 'Fecha inicio YYYY-MM-DD (opcional)' },
      { in: 'query', name: 'hasta', schema: { type: 'string', format: 'date' }, description: 'Fecha fin YYYY-MM-DD (opcional)' },
      { in: 'query', name: 'cliente_id', schema: { type: 'integer' }, description: 'Filtrar por cliente (opcional)' },
      { in: 'query', name: 'local_id', schema: { type: 'integer' }, description: 'Filtrar por local (opcional)' },
      { in: 'query', name: 'formato', schema: { type: 'string', enum: ['excel'] }, description: 'Si se envía "excel" descarga archivo' }
    ],
    responses: {
      200: { description: 'Ventas por cliente en JSON o Excel' },
      400: { description: 'Parámetros inválidos' },
      401: { description: 'No autorizado' }
    }
  }
};

swaggerSpec.paths['/api/reportes/productos-cliente'] = {
  get: {
    tags: ['Reportes'],
    summary: 'Producto más comprado por cliente',
    description: 'Devuelve el producto más comprado por cada cliente en el rango indicado. Incluye filtros opcionales por cliente y local.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { in: 'query', name: 'desde', schema: { type: 'string', format: 'date' }, description: 'Fecha inicio YYYY-MM-DD (opcional)' },
      { in: 'query', name: 'hasta', schema: { type: 'string', format: 'date' }, description: 'Fecha fin YYYY-MM-DD (opcional)' },
      { in: 'query', name: 'cliente_id', schema: { type: 'integer' }, description: 'Filtrar por cliente (opcional)' },
      { in: 'query', name: 'local_id', schema: { type: 'integer' }, description: 'Filtrar por local (opcional)' },
      { in: 'query', name: 'formato', schema: { type: 'string', enum: ['excel'] }, description: 'Si se envía "excel" descarga archivo' }
    ],
    responses: {
      200: { description: 'Producto más comprado por cliente en JSON o Excel' },
      400: { description: 'Parámetros inválidos' },
      401: { description: 'No autorizado' }
    }
  }
};

swaggerSpec.paths['/api/reportes/promociones'] = {
  get: {
    tags: ['Reportes'],
    summary: 'Promociones más vendidas',
    description: 'Lista promociones vendidas en el rango indicado, sin detalle de productos. Ordena por cantidad vendida.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { in: 'query', name: 'desde', schema: { type: 'string', format: 'date' }, description: 'Fecha inicio YYYY-MM-DD (opcional)' },
      { in: 'query', name: 'hasta', schema: { type: 'string', format: 'date' }, description: 'Fecha fin YYYY-MM-DD (opcional)' },
      { in: 'query', name: 'local_id', schema: { type: 'integer' }, description: 'Filtrar por local (opcional)' },
      { in: 'query', name: 'formato', schema: { type: 'string', enum: ['excel'] }, description: 'Si se envía "excel" descarga archivo' }
    ],
    responses: {
      200: { description: 'Promociones más vendidas en JSON o Excel' },
      400: { description: 'Parámetros inválidos' },
      401: { description: 'No autorizado' }
    }
  }
};

swaggerSpec.paths['/api/reportes/promociones-clientes'] = {
  get: {
    tags: ['Reportes'],
    summary: 'Clientes que más compran promociones',
    description: 'Muestra clientes ordenados por cantidad de promociones compradas, con su promoción más frecuente.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { in: 'query', name: 'desde', schema: { type: 'string', format: 'date' }, description: 'Fecha inicio YYYY-MM-DD (opcional)' },
      { in: 'query', name: 'hasta', schema: { type: 'string', format: 'date' }, description: 'Fecha fin YYYY-MM-DD (opcional)' },
      { in: 'query', name: 'local_id', schema: { type: 'integer' }, description: 'Filtrar por local (opcional)' },
      { in: 'query', name: 'formato', schema: { type: 'string', enum: ['excel'] }, description: 'Si se envía "excel" descarga archivo' }
    ],
    responses: {
      200: { description: 'Clientes y promociones en JSON o Excel' },
      400: { description: 'Parámetros inválidos' },
      401: { description: 'No autorizado' }
    }
  }
};

swaggerSpec.paths['/api/reportes/ventas'] = {
  get: {
    tags: ['Reportes'],
    summary: 'Reporte de ventas (por fecha, local, usuario)',
    parameters: [
      { name: 'fecha_inicio', in: 'query', schema: { type: 'string', format: 'date' } },
      { name: 'fecha_fin', in: 'query', schema: { type: 'string', format: 'date' } },
      { name: 'local_id', in: 'query', schema: { type: 'integer' } },
      { name: 'usuario_id', in: 'query', schema: { type: 'integer' } }
    ],
    responses: { '200': { description: 'Reporte de ventas', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/ReporteVenta' } } } } } },
    security: [{ bearerAuth: [] }]
  }
};

swaggerSpec.paths['/api/reportes/stock'] = {
  get: {
    tags: ['Reportes'],
    summary: 'Stock y movimientos de productos',
    parameters: [
      { name: 'local_id', in: 'query', schema: { type: 'integer' }, description: 'Filtrar por local (opcional)' },
      { name: 'desde', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Fecha inicio YYYY-MM-DD (opcional)' },
      { name: 'hasta', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Fecha fin YYYY-MM-DD (opcional)' },
      { name: 'formato', in: 'query', schema: { type: 'string', enum: ['excel'] }, description: 'Si se envía "excel" descarga archivo' }
    ],
    responses: { '200': { description: 'Reporte de stock de productos', content: { 'application/json': { schema: { type: 'array' } } } } },
    security: [{ bearerAuth: [] }]
  }
};

swaggerSpec.paths['/api/reportes/stock-ajustes'] = {
  get: {
    tags: ['Reportes'],
    summary: 'Ajustes manuales de stock',
    description: 'Lista movimientos de ajuste (entradas/salidas manuales) con filtros opcionales y export a Excel.',
    parameters: [
      { name: 'local_id', in: 'query', schema: { type: 'integer' }, description: 'Filtrar por local (opcional)' },
      { name: 'producto_id', in: 'query', schema: { type: 'integer' }, description: 'Filtrar por producto (opcional)' },
      { name: 'desde', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Fecha inicio YYYY-MM-DD (opcional)' },
      { name: 'hasta', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Fecha fin YYYY-MM-DD (opcional)' },
      { name: 'formato', in: 'query', schema: { type: 'string', enum: ['excel', 'json'] }, description: 'Si se envía "excel" descarga archivo' }
    ],
    responses: {
      '200': {
        description: 'Listado de ajustes de stock',
        content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/AjusteStock' } } } }
      },
      '401': { description: 'No autorizado' }
    },
    security: [{ bearerAuth: [] }]
  }
};

swaggerSpec.paths['/api/productos/{id}/ajuste'] = {
  post: {
    tags: ['Productos'],
    summary: 'Ajuste manual de stock (admin)',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              cantidad: { type: 'number', description: 'Positivo entrada, negativo salida' },
              motivo: { type: 'string' }
            },
            required: ['cantidad']
          }
        }
      }
    },
    responses: {
      '200': { description: 'Ajuste registrado' },
      '400': { description: 'Validación o stock insuficiente' },
      '401': { description: 'No autorizado' }
    },
    security: [{ bearerAuth: [] }]
  }
};

swaggerSpec.paths['/api/alertas'] = {
  get: {
    tags: ['Alertas'],
    summary: 'Alertas en pantalla (stock/ventas)',
    description: 'Solo visualización en el panel. No envía correo ni Slack.',
    parameters: [
      { in: 'query', name: 'estado', schema: { type: 'string', enum: ['pending', 'all'] }, description: 'Filtra estado. Por defecto pending.' }
    ],
    responses: {
      '200': { description: 'Listado de alertas', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Alerta' } } } } },
      '401': { description: 'No autorizado' }
    },
    security: [{ bearerAuth: [] }]
  }
};

swaggerSpec.paths['/api/reportes/caja'] = {
  get: {
    tags: ['Reportes'],
    summary: 'Reporte de caja (por fecha, local)',
    parameters: [
      { name: 'fecha_inicio', in: 'query', schema: { type: 'string', format: 'date' } },
      { name: 'fecha_fin', in: 'query', schema: { type: 'string', format: 'date' } },
      { name: 'local_id', in: 'query', schema: { type: 'integer' } }
    ],
    responses: { '200': { description: 'Reporte de caja', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/ReporteCaja' } } } } } },
    security: [{ bearerAuth: [] }]
  }
};

// KPIs
swaggerSpec.paths['/api/reportes/kpis'] = {
  get: {
    tags: ['Reportes'],
    summary: 'KPIs de ventas en rango',
    parameters: [
      { name: 'desde', in: 'query', schema: { type: 'string', format: 'date' }, required: true },
      { name: 'hasta', in: 'query', schema: { type: 'string', format: 'date' }, required: true },
      { name: 'formato', in: 'query', schema: { type: 'string', enum: ['excel'] }, description: 'Si se envía "excel" descarga el archivo' }
    ],
    responses: {
      '200': {
        description: 'KPIs calculados',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                ventas_por_dia: { type: 'array', items: { type: 'object', properties: { dia: { type: 'string', format: 'date' }, total_dia: { type: 'number' }, tickets: { type: 'integer' } } } },
                ventas_por_hora: { type: 'array', items: { type: 'object', properties: { hora: { type: 'number' }, total_hora: { type: 'number' }, tickets: { type: 'integer' } } } },
                ticket_promedio: { type: 'object', properties: { ticket_promedio: { type: 'number' }, total: { type: 'number' }, tickets: { type: 'integer' } } },
                margen: { type: 'object', properties: { margen_bruto: { type: 'number', nullable: true }, costo_total: { type: 'number', nullable: true }, ingreso_total: { type: 'number', nullable: true } } }
              }
            }
          }
        }
      },
      '401': { description: 'No autorizado' }
    },
    security: [{ bearerAuth: [] }]
  }
};

// Proveedores
swaggerSpec.paths['/api/proveedores'] = {
  get: {
    tags: ['Proveedores'],
    summary: 'Listar proveedores del negocio (opcional filtrar por estado)',
    parameters: [
      { name: 'estado', in: 'query', schema: { type: 'boolean' }, description: 'true para solo activos' }
    ],
    responses: { '200': { description: 'Listado', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Proveedor' } } } } } }
  },
  post: {
    tags: ['Proveedores'],
    summary: 'Crear proveedor',
    requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Proveedor' } } } },
    responses: { '201': { description: 'Creado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Proveedor' } } } }, '409': { description: 'CUIT duplicado' } }
  }
};

swaggerSpec.paths['/api/proveedores/{id}'] = {
  get: {
    tags: ['Proveedores'],
    summary: 'Obtener proveedor',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
    responses: { '200': { description: 'Proveedor', content: { 'application/json': { schema: { $ref: '#/components/schemas/Proveedor' } } } }, '404': { description: 'No encontrado' } }
  },
  put: {
    tags: ['Proveedores'],
    summary: 'Actualizar proveedor',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
    requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Proveedor' } } } },
    responses: { '200': { description: 'Actualizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Proveedor' } } } }, '409': { description: 'CUIT duplicado' } }
  }
};

swaggerSpec.paths['/api/proveedores/{id}/toggle'] = {
  patch: {
    tags: ['Proveedores'],
    summary: 'Alternar estado activo/inactivo',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
    responses: { '200': { description: 'Estado actualizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Proveedor' } } } }, '404': { description: 'No encontrado' } }
  }
};

// Categorías
swaggerSpec.paths['/api/categorias'] = {
  get: {
    tags: ['Categorias'],
    summary: 'Listar categorías',
    responses: { '200': { description: 'Listado de categorías', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Categoria' } } } } } },
    security: [{ bearerAuth: [] }]
  },
  post: {
    tags: ['Categorias'],
    summary: 'Crear categoría',
    requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CategoriaCreate' } } } },
    responses: { '201': { description: 'Categoría creada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Categoria' } } } } },
    security: [{ bearerAuth: [] }]
  }
};

swaggerSpec.paths['/api/categorias/{id}'] = {
  put: {
    tags: ['Categorias'],
    summary: 'Actualizar categoría',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
    requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CategoriaCreate' } } } },
    responses: { '200': { description: 'Categoría actualizada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Categoria' } } } } },
    security: [{ bearerAuth: [] }]
  },
  delete: {
    tags: ['Categorias'],
    summary: 'Eliminar categoría',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
    responses: { '200': { description: 'Categoría eliminada' } },
    security: [{ bearerAuth: [] }]
  }
};

// Caja y movimientos de caja
swaggerSpec.paths['/api/caja/movimientos'] = {
  get: {
    tags: ['Caja'],
    summary: 'Listar movimientos de caja (por turno, local o fecha)',
    parameters: [
      { name: 'turno_id', in: 'query', schema: { type: 'integer' } },
      { name: 'local_id', in: 'query', schema: { type: 'integer' } },
      { name: 'fecha', in: 'query', schema: { type: 'string', format: 'date' } }
    ],
    responses: { '200': { description: 'Listado de movimientos', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/MovimientoCaja' } } } } }, '403': { description: 'No autorizado' } },
    security: [{ bearerAuth: [] }]
  },
  post: {
    tags: ['Caja'],
    summary: 'Registrar movimiento de caja (venta, gasto, retiro, etc)',
    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/MovimientoCajaCreate' } } } },
    responses: { '201': { description: 'Movimiento registrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/MovimientoCaja' } } } }, '403': { description: 'No autorizado' } },
    security: [{ bearerAuth: [] }]
  }
};

swaggerSpec.paths['/api/caja/retiros'] = {
  post: {
    tags: ['Caja'],
    summary: 'Registrar retiro de caja',
    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RetiroCajaCreate' } } } },
    responses: { '201': { description: 'Retiro registrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/RetiroCaja' } } } }, '403': { description: 'No autorizado' } },
    security: [{ bearerAuth: [] }]
  }
};

swaggerSpec.paths['/api/caja/arqueo'] = {
  get: {
    tags: ['Caja'],
    summary: 'Obtener arqueo de caja por turno',
    parameters: [ { name: 'turno_id', in: 'query', required: true, schema: { type: 'integer' } } ],
    responses: { '200': { description: 'Arqueo de caja', content: { 'application/json': { schema: { $ref: '#/components/schemas/ArqueoCaja' } } } }, '403': { description: 'No autorizado' } },
    security: [{ bearerAuth: [] }]
  }
};

// Negocios (admin/saas)
swaggerSpec.paths['/api/negocios'] = {
  get: {
    tags: ['Negocios'],
    summary: 'Listar negocios (solo superadmin)',
    responses: {
      '200': { description: 'Listado de negocios', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Negocio' } } } } },
      '403': { description: 'No autorizado' }
    },
    security: [{ bearerAuth: [] }]
  },
  post: {
    tags: ['Negocios'],
    summary: 'Crear negocio (solo superadmin)',
    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NegocioCreate' } } } },
    responses: { '200': { description: 'Negocio creado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Negocio' } } } }, '403': { description: 'No autorizado' } },
    security: [{ bearerAuth: [] }]
  }
};

swaggerSpec.paths['/api/negocios/{id}/estado'] = {
  put: {
    tags: ['Negocios'],
    summary: 'Cambiar estado del negocio (solo superadmin)',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              estado: { type: 'string', enum: ['activo', 'trial', 'suspendido', 'baja'] },
              motivo: { type: 'string', nullable: true }
            },
            required: ['estado']
          }
        }
      }
    },
    responses: {
      '200': { description: 'Estado actualizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Negocio' } } } },
      '404': { description: 'No encontrado' },
      '403': { description: 'No autorizado' }
    },
    security: [{ bearerAuth: [] }]
  }
};

swaggerSpec.paths['/api/negocios/{id}/logs'] = {
  get: {
    tags: ['Negocios'],
    summary: 'Historial de acciones del negocio (solo superadmin)',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
    responses: {
      '200': { description: 'Listado de logs', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/NegocioLog' } } } } },
      '403': { description: 'No autorizado' }
    },
    security: [{ bearerAuth: [] }]
  }
};

swaggerSpec.paths['/api/negocios/{id}/admin/password'] = {
  put: {
    tags: ['Negocios'],
    summary: 'Resetear contraseña del admin principal del negocio (solo superadmin)',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: { password: { type: 'string', minLength: 6 } },
            required: ['password']
          }
        }
      }
    },
    responses: {
      '200': { description: 'Contraseña reseteada' },
      '404': { description: 'Admin no encontrado' },
      '403': { description: 'No autorizado' }
    },
    security: [{ bearerAuth: [] }]
  }
};

swaggerSpec.paths['/api/negocios/asignar-admin'] = {
  post: {
    tags: ['Negocios'],
    summary: 'Asignar usuario admin a negocio (solo superadmin)',
    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NegocioAsignarAdmin' } } } },
    responses: { '200': { description: 'Admin asignado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Usuario' } } } }, '409': { description: 'Usuario ya existe' }, '403': { description: 'No autorizado' } },
    security: [{ bearerAuth: [] }]
  }
};

swaggerSpec.paths['/api/negocios/usuarios-operativos'] = {
  post: {
    tags: ['Negocios'],
    summary: 'Crear usuario operativo (admin o superadmin)',
    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NegocioUsuarioOperativo' } } } },
    responses: { '200': { description: 'Usuario creado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Usuario' } } } }, '409': { description: 'Usuario ya existe' }, '403': { description: 'No autorizado' } },
    security: [{ bearerAuth: [] }]
  }
};

swaggerSpec.paths['/api/negocios/{id}'] = {
  put: {
    tags: ['Negocios'],
    summary: 'Actualizar negocio (solo superadmin)',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NegocioCreate' } } } },
    responses: { '200': { description: 'Negocio actualizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Negocio' } } } }, '404': { description: 'No encontrado' }, '403': { description: 'No autorizado' } },
    security: [{ bearerAuth: [] }]
  },
  delete: {
    tags: ['Negocios'],
    summary: 'Eliminar negocio (solo superadmin)',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
    responses: { '200': { description: 'Negocio eliminado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Negocio' } } } }, '404': { description: 'No encontrado' }, '403': { description: 'No autorizado' } },
    security: [{ bearerAuth: [] }]
  }
};

// Auth
swaggerSpec.paths['/api/auth/login'] = {
  post: {
    tags: ['Auth'],
    summary: 'Iniciar sesión y obtener token JWT',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/LoginRequest' }
        }
      }
    },
    responses: {
      '200': { description: 'Token JWT', content: { 'application/json': { schema: { type: 'object', properties: { token: { type: 'string' } } } } } },
      '401': { description: 'Credenciales inválidas' }
    }
  }
};

// Usuarios
swaggerSpec.paths['/api/usuarios'] = {
  get: {
    tags: ['Usuarios'],
    summary: 'Listar usuarios del negocio',
    security: [{ bearerAuth: [] }],
    responses: {
      '200': {
        description: 'Listado de usuarios',
        content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Usuario' } } } }
      }
    }
  },
  post: {
    tags: ['Usuarios'],
    summary: 'Crear usuario (admin/superadmin)',
    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UsuarioCreate' } } } },
    responses: { '201': { description: 'Usuario creado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Usuario' } } } } },
    security: [{ bearerAuth: [] }]
  }
};

// Pagos
swaggerSpec.paths['/api/pagos'] = {
  get: { tags: ['Pagos'], summary: 'Listar pagos con filtros', parameters: [{ name: 'venta_id', in: 'query', schema: { type: 'integer' } }, { name: 'metodo_id', in: 'query', schema: { type: 'integer' } }], responses: { '200': { description: 'Listado de pagos' } }, security: [{ bearerAuth: [] }] },
  post: { tags: ['Pagos'], summary: 'Registrar pago para una venta', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PagoCreate' } } } }, responses: { '201': { description: 'Pago creado' } }, security: [{ bearerAuth: [] }] }
};

// Clientes
swaggerSpec.paths['/api/clientes'] = {
  get: { tags: ['Clientes'], summary: 'Listar clientes', responses: { '200': { description: 'Listado de clientes' } }, security: [{ bearerAuth: [] }] },
  post: { tags: ['Clientes'], summary: 'Crear cliente', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/ClienteCreate' } } } }, responses: { '201': { description: 'Cliente creado' } }, security: [{ bearerAuth: [] }] }
};

swaggerSpec.paths['/api/clientes/{id}'] = {
  get: { tags: ['Clientes'], summary: 'Obtener cliente', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Cliente' } }, security: [{ bearerAuth: [] }] },
  put: { tags: ['Clientes'], summary: 'Actualizar cliente', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/ClienteCreate' } } } }, responses: { '200': { description: 'Actualizado' } }, security: [{ bearerAuth: [] }] },
  delete: { tags: ['Clientes'], summary: 'Eliminar cliente', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Eliminado' } }, security: [{ bearerAuth: [] }] }
};

swaggerSpec.paths['/api/pagos/{id}'] = {
  get: { tags: ['Pagos'], summary: 'Obtener pago por id', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Pago' } }, security: [{ bearerAuth: [] }] },
  put: { tags: ['Pagos'], summary: 'Actualizar pago', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/PagoCreate' } } } }, responses: { '200': { description: 'Actualizado' } }, security: [{ bearerAuth: [] }] },
  delete: { tags: ['Pagos'], summary: 'Eliminar pago', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Eliminado' } }, security: [{ bearerAuth: [] }] }
};

swaggerSpec.paths['/api/pagos/{id}/refund'] = {
  post: { tags: ['Pagos'], summary: 'Registrar reembolso e insertar retiro en caja', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Reembolso registrado' } }, security: [{ bearerAuth: [] }] }
};

// Métodos de pago
swaggerSpec.paths['/api/metodos-pago'] = {
  get: { tags: ['MetodosPago'], summary: 'Listar métodos de pago', responses: { '200': { description: 'Lista' } }, security: [{ bearerAuth: [] }] },
  post: { tags: ['MetodosPago'], summary: 'Crear método de pago', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/MetodoPagoCreate' } } } }, responses: { '201': { description: 'Creado' } }, security: [{ bearerAuth: [] }] }
};

// Compras
swaggerSpec.paths['/api/compras'] = {
  get: {
    tags: ['Compras'],
    summary: 'Listar compras',
    parameters: [
      { name: 'proveedor_id', in: 'query', schema: { type: 'integer' } },
      { name: 'local_id', in: 'query', schema: { type: 'integer' } }
    ],
    responses: {
      '200': {
        description: 'Lista de compras',
        content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Compra' } } } }
      }
    },
    security: [{ bearerAuth: [] }]
  },
  post: {
    tags: ['Compras'],
    summary: 'Registrar compra y actualizar stock',
    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CompraCreate' } } } },
    responses: { '201': { description: 'Compra registrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Compra' } } } } },
    security: [{ bearerAuth: [] }]
  }
};

// Insumos
swaggerSpec.paths['/api/insumos'] = {
  get: {
    tags: ['Insumos'],
    summary: 'Listar insumos',
    responses: {
      '200': { description: 'Listado de insumos', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Insumo' } } } } }
    },
    security: [{ bearerAuth: [] }]
  }
};

// Facturación
swaggerSpec.paths['/api/facturacion'] = {
  post: { tags: ['Facturacion'], summary: 'Emitir comprobante / generar factura', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/FacturaCreate' } } } }, responses: { '201': { description: 'Comprobante generado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Invoice' } } } } }, security: [{ bearerAuth: [] }] },
  get: { tags: ['Facturacion'], summary: 'Listar comprobantes', responses: { '200': { description: 'Listado de comprobantes' } }, security: [{ bearerAuth: [] }] }
};

swaggerSpec.paths['/api/facturacion/{id}'] = {
  get: { tags: ['Facturacion'], summary: 'Obtener comprobante por id', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Comprobante' } }, security: [{ bearerAuth: [] }] }
};

// Admin - Plans
swaggerSpec.paths['/api/admin/plans'] = {
  get: { tags: ['Admin'], summary: 'Listar planes disponibles (superadmin)', responses: { '200': { description: 'Listado de planes', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Plan' } } } } } }, security: [{ bearerAuth: [] }] },
  post: { tags: ['Admin'], summary: 'Crear plan (superadmin)', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Plan' } } } }, responses: { '201': { description: 'Plan creado' } }, security: [{ bearerAuth: [] }] }
};

swaggerSpec.paths['/api/admin/plans/{id}'] = {
  put: { tags: ['Admin'], summary: 'Actualizar plan', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Plan' } } } }, responses: { '200': { description: 'Actualizado' } }, security: [{ bearerAuth: [] }] },
  delete: { tags: ['Admin'], summary: 'Eliminar plan', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Eliminado' } }, security: [{ bearerAuth: [] }] }
};

// Admin - Subscriptions
swaggerSpec.paths['/api/admin/subscriptions'] = {
  get: { tags: ['Admin'], summary: 'Listar suscripciones', responses: { '200': { description: 'Listado de suscripciones', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Subscription' } } } } } }, security: [{ bearerAuth: [] }] },
  post: { tags: ['Admin'], summary: 'Crear suscripción para un negocio', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SubscriptionCreate' } } } }, responses: { '201': { description: 'Suscripción creada' } }, security: [{ bearerAuth: [] }] }
};

swaggerSpec.paths['/api/admin/subscriptions/{id}'] = {
  put: { tags: ['Admin'], summary: 'Actualizar suscripción (cambiar plan / estado)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Subscription' } } } }, responses: { '200': { description: 'Actualizado' } }, security: [{ bearerAuth: [] }] },
  delete: { tags: ['Admin'], summary: 'Cancelar suscripción', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Cancelado' } }, security: [{ bearerAuth: [] }] }
};

// Stock
swaggerSpec.paths['/api/stock/{local_id}'] = {
  get: { tags: ['Stock'], summary: 'Consultar stock por local', parameters: [{ name: 'local_id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Stock por local' } }, security: [{ bearerAuth: [] }] }
};

// Ajuste de stock
swaggerSpec.paths['/api/stock/ajuste'] = {
  post: { tags: ['Stock'], summary: 'Ajuste manual de stock (admin)', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/StockAjuste' } } } }, responses: { '200': { description: 'Ajuste registrado' } }, security: [{ bearerAuth: [] }] }
};

// Turnos
swaggerSpec.paths['/api/turnos'] = {
  post: { tags: ['Turnos'], summary: 'Abrir turno', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/TurnoCreate' } } } }, responses: { '201': { description: 'Turno abierto' } }, security: [{ bearerAuth: [] }] }
};

// Empleados
swaggerSpec.paths['/api/empleados'] = {
  get: {
    tags: ['Empleados'],
    summary: 'Listar empleados (por defecto solo activos)',
    parameters: [{ name: 'estado', in: 'query', schema: { type: 'string', enum: ['activos','todos'] }, description: 'usar "todos" para incluir bajas' }],
    responses: { '200': { description: 'Listado de empleados', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Empleado' } } } } } },
    security: [{ bearerAuth: [] }]
  },
  post: {
    tags: ['Empleados'],
    summary: 'Crear empleado',
    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/EmpleadoCreate' } } } },
    responses: { '201': { description: 'Empleado creado' }, '409': { description: 'Documento duplicado' } },
    security: [{ bearerAuth: [] }]
  }
};

swaggerSpec.paths['/api/empleados/{id}'] = {
  get: {
    tags: ['Empleados'],
    summary: 'Obtener empleado por id',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
    responses: { '200': { description: 'Empleado' }, '404': { description: 'No encontrado' } },
    security: [{ bearerAuth: [] }]
  },
  put: {
    tags: ['Empleados'],
    summary: 'Actualizar empleado',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Empleado' } } } },
    responses: { '200': { description: 'Actualizado' }, '404': { description: 'No encontrado' } },
    security: [{ bearerAuth: [] }]
  },
  delete: {
    tags: ['Empleados'],
    summary: 'Dar de baja empleado',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
    requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { motivo_baja: { type: 'string' }, fecha_fin: { type: 'string', format: 'date' } } } } } },
    responses: { '200': { description: 'Baja realizada' }, '404': { description: 'No encontrado' } },
    security: [{ bearerAuth: [] }]
  }
};

// Changelog (global)
swaggerSpec.paths['/api/admin/changelog'] = {
  get: {
    tags: ['Admin'],
    summary: 'Listar changelog (admin y superadmin)',
    parameters: [
      { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Buscar por texto' },
      { name: 'modulo', in: 'query', schema: { type: 'string' } },
      { name: 'desde', in: 'query', schema: { type: 'string', format: 'date-time' } },
      { name: 'hasta', in: 'query', schema: { type: 'string', format: 'date-time' } }
    ],
    responses: { '200': { description: 'Listado de entradas', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/ChangelogEntry' } } } } } },
    security: [{ bearerAuth: [] }]
  },
  post: {
    tags: ['Admin'],
    summary: 'Crear entrada de changelog (superadmin)',
    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ChangelogEntry' } } } },
    responses: { '201': { description: 'Creado' } },
    security: [{ bearerAuth: [] }]
  }
};

swaggerSpec.paths['/api/admin/changelog/{id}'] = {
  put: {
    tags: ['Admin'],
    summary: 'Actualizar entrada de changelog (superadmin)',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ChangelogEntry' } } } },
    responses: { '200': { description: 'Actualizado' }, '404': { description: 'No encontrado' } },
    security: [{ bearerAuth: [] }]
  },
  delete: {
    tags: ['Admin'],
    summary: 'Eliminar entrada de changelog (superadmin)',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
    responses: { '200': { description: 'Eliminado' }, '404': { description: 'No encontrado' } },
    security: [{ bearerAuth: [] }]
  }
};

// Basic components (schemas)
swaggerSpec.components = swaggerSpec.components || {};
swaggerSpec.components.schemas = {
  Turno: { type: 'object', properties: { id: { type: 'integer' }, negocio_id: { type: 'integer' }, local_id: { type: 'integer' }, usuario_id: { type: 'integer' }, fecha_apertura: { type: 'string' }, fecha_cierre: { type: 'string' }, saldo_inicial: { type: 'number' }, saldo_final: { type: 'number' }, estado: { type: 'string' } } },
  Empleado: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      negocio_id: { type: 'integer' },
      nombre: { type: 'string' },
      apellido: { type: 'string' },
      documento: { type: 'string' },
      fecha_nacimiento: { type: 'string', format: 'date' },
      telefono: { type: 'string' },
      email: { type: 'string' },
      direccion: { type: 'string' },
      localidad: { type: 'string' },
      sexo: { type: 'string', enum: ['masculino','femenino'] },
      legajo: { type: 'string' },
      banco: { type: 'string' },
      cbu: { type: 'string' },
      alias: { type: 'string' },
      fecha_inicio: { type: 'string', format: 'date' },
      fecha_fin: { type: 'string', format: 'date' },
      motivo_baja: { type: 'string' },
      activo: { type: 'boolean' },
      creado_en: { type: 'string', format: 'date-time' }
    }
  },
  EmpleadoCreate: {
    type: 'object',
    properties: {
      nombre: { type: 'string' },
      apellido: { type: 'string' },
      documento: { type: 'string' },
      fecha_nacimiento: { type: 'string', format: 'date' },
      telefono: { type: 'string' },
      email: { type: 'string' },
      direccion: { type: 'string' },
      localidad: { type: 'string' },
      sexo: { type: 'string', enum: ['masculino','femenino'] },
      legajo: { type: 'string' },
      banco: { type: 'string' },
      cbu: { type: 'string' },
      alias: { type: 'string' },
      fecha_inicio: { type: 'string', format: 'date' },
      fecha_fin: { type: 'string', format: 'date' },
      motivo_baja: { type: 'string' }
    },
    required: ['nombre']
  },
  ReporteVenta: { type: 'object', properties: { fecha: { type: 'string' }, total: { type: 'number' }, cantidad: { type: 'integer' }, usuario_id: { type: 'integer' }, local_id: { type: 'integer' } } },
  ReporteCaja: { type: 'object', properties: { fecha: { type: 'string' }, ingresos: { type: 'number' }, egresos: { type: 'number' }, saldo: { type: 'number' }, local_id: { type: 'integer' } } },
  Insumo: { type: 'object', properties: { id: { type: 'integer' }, nombre: { type: 'string' }, unidad: { type: 'string' }, stock_total: { type: 'number' } } },
  CompraDetalle: { type: 'object', properties: { insumo_id: { type: 'integer' }, nombre: { type: 'string' }, cantidad: { type: 'number' }, precio_unitario: { type: 'number' }, subtotal: { type: 'number' } } },
  Compra: { type: 'object', properties: { id: { type: 'integer' }, fecha: { type: 'string' }, total: { type: 'number' }, local_id: { type: 'integer' }, local: { type: 'string' }, proveedor_id: { type: 'integer' }, proveedor: { type: 'string' }, detalles: { type: 'array', items: { $ref: '#/components/schemas/CompraDetalle' } } } },
  CompraCreate: { type: 'object', properties: { proveedor_id: { type: 'integer', nullable: true }, local_id: { type: 'integer' }, detalles: { type: 'array', items: { type: 'object', properties: { insumo_id: { type: 'integer' }, cantidad: { type: 'number' }, precio_unitario: { type: 'number' } }, required: ['insumo_id','cantidad','precio_unitario'] } } }, required: ['local_id','detalles'] },
  Categoria: { type: 'object', properties: { id: { type: 'integer' }, nombre: { type: 'string' }, negocio_id: { type: 'integer' }, orden: { type: 'integer' }, estado: { type: 'boolean' } } },
  CategoriaCreate: { type: 'object', properties: { nombre: { type: 'string' }, negocio_id: { type: 'integer' }, orden: { type: 'integer' }, estado: { type: 'boolean' } }, required: ['nombre','negocio_id'] },
  MovimientoCaja: { type: 'object', properties: { id: { type: 'integer' }, turno_id: { type: 'integer' }, usuario_id: { type: 'integer' }, tipo: { type: 'string' }, descripcion: { type: 'string' }, monto: { type: 'number' }, fecha: { type: 'string' } } },
  MovimientoCajaCreate: { type: 'object', properties: { turno_id: { type: 'integer' }, tipo: { type: 'string' }, descripcion: { type: 'string' }, monto: { type: 'number' } }, required: ['turno_id','tipo','monto'] },
  RetiroCaja: { type: 'object', properties: { id: { type: 'integer' }, turno_id: { type: 'integer' }, usuario_id: { type: 'integer' }, negocio_id: { type: 'integer' }, local_id: { type: 'integer' }, monto: { type: 'number' }, motivo: { type: 'string' }, fecha: { type: 'string' } } },
  RetiroCajaCreate: { type: 'object', properties: { turno_id: { type: 'integer' }, usuario_id: { type: 'integer' }, negocio_id: { type: 'integer' }, local_id: { type: 'integer' }, monto: { type: 'number' }, motivo: { type: 'string' } }, required: ['turno_id','usuario_id','negocio_id','local_id','monto'] },
  ArqueoCaja: { type: 'object', properties: { turno_id: { type: 'integer' }, saldo_inicial: { type: 'number' }, saldo_final: { type: 'number' }, ventas: { type: 'number' }, retiros: { type: 'number' }, gastos: { type: 'number' }, fecha: { type: 'string' } } },
  Negocio: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      nombre: { type: 'string' },
      activo: { type: 'boolean' },
      creado_en: { type: 'string' },
      estado: { type: 'string', enum: ['activo', 'trial', 'suspendido', 'baja'], description: 'Estado SaaS' },
      motivo_estado: { type: 'string', nullable: true },
      admin_id: { type: 'integer', nullable: true },
      admin_nombre: { type: 'string', nullable: true },
      admin_email: { type: 'string', nullable: true }
    }
  },
  NegocioCreate: { type: 'object', properties: { nombre: { type: 'string' } }, required: ['nombre'] },
  NegocioLog: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      negocio_id: { type: 'integer' },
      usuario_id: { type: 'integer' },
      usuario_email: { type: 'string', nullable: true },
      accion: { type: 'string' },
      motivo: { type: 'string', nullable: true },
      metadata: { type: 'object', nullable: true },
      created_at: { type: 'string', format: 'date-time' }
    }
  },
  NegocioAsignarAdmin: { type: 'object', properties: { negocio_id: { type: 'integer' }, email: { type: 'string' }, password: { type: 'string' } }, required: ['negocio_id','email','password'] },
  NegocioUsuarioOperativo: { 
    type: 'object', 
    properties: { 
      negocio_id: { type: 'integer' }, 
      local_id: { type: 'integer' }, 
      rol: { type: 'string', description: 'Rol configurable: admin, cajero, vendedor, encargado, consulta, etc. (superadmin está reservado)' }, 
      turno: { type: 'string' }, 
      email: { type: 'string' }, 
      password: { type: 'string' } 
    }, 
    required: ['negocio_id','rol','turno','email','password'],
    example: {
      negocio_id: 1,
      local_id: 2,
      rol: 'cajero',
      turno: 'mañana',
      email: 'cajero.panaderia@example.com',
      password: '123456'
    }
  },
  LoginRequest: { type: 'object', properties: { usuario: { type: 'string' }, password: { type: 'string' } }, required: ['usuario','password'] },
  Usuario: { type: 'object', properties: { id: { type: 'integer' }, nombre: { type: 'string' }, email: { type: 'string' }, rol: { type: 'string' }, local_id: { type: 'integer' } } },
  UsuarioCreate: { type: 'object', properties: { nombre: { type: 'string' }, email: { type: 'string' }, password: { type: 'string' }, rol: { type: 'string' }, local_id: { type: 'integer' } }, required: ['nombre','email','password'] },
  UsuarioUpdate: { type: 'object', properties: { nombre: { type: 'string' }, email: { type: 'string' }, rol: { type: 'string' }, local_id: { type: 'integer' }, activo: { type: 'boolean' } } },
  Producto: { type: 'object', properties: { id: { type: 'integer' }, nombre: { type: 'string' }, precio: { type: 'number' }, stock_total: { type: 'number' }, categorias: { type: 'array', items: { type: 'string' } } } },
  ProductoCreate: { type: 'object', properties: { nombre: { type: 'string' }, precio: { type: 'number' }, stock_total: { type: 'number' }, categorias: { type: 'array', items: { type: 'integer' } } }, required: ['nombre','precio'] },
  VentaCreate: { type: 'object', properties: { cliente_id: { type: 'integer' }, productos: { type: 'array', items: { type: 'object', properties: { producto_id: { type: 'integer' }, cantidad: { type: 'integer' }, descuento: { type: 'number' } } } }, pagos: { type: 'array', items: { type: 'object', properties: { metodo_id: { type: 'integer' }, monto: { type: 'number' } } } }, emit_comprobante: { type: 'boolean' }, tipo_comprobante: { type: 'string' } }, required: ['productos','pagos'] },
  Venta: { type: 'object', properties: { id: { type: 'integer' }, fecha: { type: 'string' }, total: { type: 'number' } } },
  PagoCreate: { type: 'object', properties: { venta_id: { type: 'integer' }, metodo_id: { type: 'integer' }, monto: { type: 'number' } }, required: ['venta_id','metodo_id','monto'] },
  MetodoPagoCreate: { type: 'object', properties: { nombre: { type: 'string' }, descripcion: { type: 'string' } }, required: ['nombre'] },
  CompraCreate: { type: 'object', properties: { proveedor_id: { type: 'integer' }, local_id: { type: 'integer' }, detalles: { type: 'array', items: { type: 'object', properties: { insumo_id: { type: 'integer' }, cantidad: { type: 'number' }, precio_unitario: { type: 'number' } } } } }, required: ['detalles'] },
  TurnoCreate: { type: 'object', properties: { local_id: { type: 'integer' }, saldo_inicial: { type: 'number' } }, required: ['local_id','saldo_inicial'] }
  ,
  ClienteCreate: { type: 'object', properties: { nombre: { type: 'string' }, email: { type: 'string' }, telefono: { type: 'string' }, dni: { type: 'string' }, direccion: { type: 'string' }, local_id: { type: 'integer' } }, required: ['nombre'] },
  Plan: { type: 'object', properties: { id: { type: 'integer' }, nombre: { type: 'string' }, precio: { type: 'number' }, intervalo: { type: 'string' }, descripcion: { type: 'string' } } },
  Subscription: { type: 'object', properties: { id: { type: 'integer' }, negocio_id: { type: 'integer' }, plan_id: { type: 'integer' }, status: { type: 'string' }, next_billing_date: { type: 'string' } } },
  Invoice: { type: 'object', properties: { id: { type: 'integer' }, negocio_id: { type: 'integer' }, monto: { type: 'number' }, due_date: { type: 'string' }, pagado: { type: 'boolean' } } },
  ChangelogEntry: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      titulo: { type: 'string' },
      contenido: { type: 'string' },
      modulo: { type: 'string', nullable: true },
      tags: { type: 'array', items: { type: 'string' } },
      visible_desde: { type: 'string', format: 'date-time' },
      image_base64: { type: 'string', nullable: true, description: 'Data URL/base64 opcional para mostrar imagen' },
      created_at: { type: 'string', format: 'date-time' },
      created_by: { type: 'integer', nullable: true }
    }
  },
  StockAjuste: { type: 'object', properties: { local_id: { type: 'integer' }, insumo_id: { type: 'integer' }, cantidad: { type: 'number' }, motivo: { type: 'string' } }, required: ['local_id','insumo_id','cantidad'] }
  ,
  FacturaCreate: { type: 'object', properties: { venta_id: { type: 'integer' }, tipo_comprobante: { type: 'string' }, cliente_id: { type: 'integer' }, datos_fiscales: { type: 'object' } }, required: ['venta_id','tipo_comprobante'] },
  SubscriptionCreate: { type: 'object', properties: { negocio_id: { type: 'integer' }, plan_id: { type: 'integer' }, start_date: { type: 'string' } }, required: ['negocio_id','plan_id'] }
};

// Definir endpoint de reset de contraseña solo al final, cuando swaggerSpec ya existe
swaggerSpec.paths['/api/usuarios/{id}/password'] = {
  put: {
    tags: ['Usuarios'],
    summary: 'Resetear contraseña de usuario',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'integer' } }
    ],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { type: 'object', properties: { password: { type: 'string', minLength: 6 } }, required: ['password'] }
        }
      }
    },
    responses: {
      '200': { description: 'Contraseña actualizada' },
      '400': { description: 'Contraseña inválida' },
      '403': { description: 'No autorizado' },
      '404': { description: 'Usuario no encontrado' }
    },
    security: [{ bearerAuth: [] }]
  }
};

module.exports = swaggerSpec;
