// Devuelve los permisos que el usuario actual puede asignar a roles personalizados de su negocio
exports.listAvailablePermissions = async (req, res) => {
  const negocioId = req.params.id;
  const userId = req.usuario.id;
  try {
    // Buscar los permisos asignados al usuario actual en el negocio
    const result = await db.query(`
      SELECT DISTINCT p.id, p.slug, p.descripcion
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      JOIN role_permissions rp ON r.id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE ur.user_id = $1 AND (r.negocio_id = $2 OR r.negocio_id IS NULL)
    `, [userId, negocioId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Error al listar permisos disponibles', error: err.message });
  }
};
// Roles recomendados (configurables por negocio):

// List roles for a business

exports.listRoles = async (req, res) => {
  const negocioId = req.params.id;
  // TODO: Implement DB query to fetch roles for this business
  res.json([]);
};

// List permissions for a business

exports.listPermissions = async (req, res) => {
  const negocioId = req.params.id;
  // TODO: Implement DB query to fetch permissions for this business
  res.json([]);
};
// - admin: acceso total al negocio
// - cajero: ventas y caja
// - vendedor: ventas
// - encargado: reportes y control local
// - consulta: solo lectura
// El rol 'superadmin' está reservado para el sistema SaaS y no puede ser creado desde la UI de negocios.
const db = require('../db');
const bcrypt = require('bcrypt');
const saltRounds = 10;

function sanitizeForUsername(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

async function generarNombreUnico(base, negocioId) {
  // Genera nombre único con sufijo incremental dentro del negocio
  const result = await db.query(
    `SELECT nombre FROM usuarios WHERE negocio_id = $1 AND nombre LIKE $2`,
    [negocioId, `${base}%`]
  );

  if (!result.rows.length) return base;

  let maxSuffix = 1;
  for (const row of result.rows) {
    const match = row.nombre.match(new RegExp(`^${base}-(\\d+)$`));
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxSuffix) maxSuffix = n;
    } else if (row.nombre === base && maxSuffix === 1) {
      maxSuffix = 1; // base ocupado, empezamos en 2 más abajo
    }
  }

  return `${base}-${maxSuffix + 1}`;
}

// Crear un nuevo negocio (solo superadmin)
exports.crearNegocio = async (req, res) => {
  try {
    const { nombre } = req.body;
    const usuario = req.usuario; // viene del JWT

    if (usuario.rol !== 'superadmin') {
      return res.status(403).json({ message: "Solo el superusuario puede crear negocios" });
    }

    if (!nombre) {
      return res.status(400).json({ message: "El nombre del negocio es obligatorio" });
    }

    const result = await db.query(
      `INSERT INTO negocios (nombre) VALUES ($1) RETURNING *`,
      [nombre]
    );

    res.json({
      message: "Negocio creado correctamente",
      negocio: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Asignar un usuario administrador al negocio (solo superadmin)
exports.asignarAdministrador = async (req, res) => {
  try {
    const { negocio_id, email, password, password_hash } = req.body;
    const usuario = req.usuario;

    if (usuario.rol !== 'superadmin') {
      return res.status(403).json({ message: "Solo el superusuario puede asignar administradores" });
    }

    // Verificar negocio
    const negocioResult = await db.query(`SELECT nombre FROM negocios WHERE id = $1`, [negocio_id]);
    if (negocioResult.rows.length === 0) {
      return res.status(404).json({ message: "Negocio no encontrado" });
    }
    const nombreNegocio = negocioResult.rows[0].nombre;

    // Generar nombre de usuario base y asegurar unicidad en el negocio
    let nombreUsuario = `principal.${sanitizeForUsername(nombreNegocio)}-${negocio_id}`;

    const existsEmail = await db.query(
      `SELECT id, email, nombre FROM usuarios WHERE negocio_id = $2 AND email = $1`,
      [email, negocio_id]
    );
    if (existsEmail.rows.length > 0) {
      return res.status(409).json({ message: 'Ya existe un usuario con ese email en este negocio', existing: existsEmail.rows[0] });
    }

    const existsNombre = await db.query(
      `SELECT id, email, nombre FROM usuarios WHERE negocio_id = $2 AND nombre = $1`,
      [nombreUsuario, negocio_id]
    );
    if (existsNombre.rows.length > 0) {
      nombreUsuario = await generarNombreUnico(nombreUsuario, negocio_id);
    }

    // Manejar password: aceptar password en claro o password_hash ya hasheada
    let storedHash;
    if (password_hash) {
      storedHash = password_hash;
    } else if (password) {
      storedHash = await bcrypt.hash(password, saltRounds);
    } else {
      return res.status(400).json({ message: "Se requiere 'password' o 'password_hash'" });
    }

    const result = await db.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, negocio_id)
       VALUES ($1, $2, $3, 'admin', $4)
       RETURNING id, nombre, email, rol, negocio_id`,
      [nombreUsuario, email, storedHash, negocio_id]
    );

    // Asociar el usuario al rol en user_roles
    const userId = result.rows[0].id;
    // Buscar el role_id por slug
    const roleRes = await db.query(
      `SELECT id FROM roles WHERE slug = $1 AND (negocio_id IS NULL OR negocio_id = $2)`,
      ['admin', negocio_id]
    );
    if (roleRes.rows.length > 0) {
      const roleId = roleRes.rows[0].id;
      await db.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, roleId]
      );
    }
    res.json({
      message: "Administrador asignado correctamente",
      usuario: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Crear usuarios operativos (admin o superadmin)
exports.crearUsuarioOperativo = async (req, res) => {
  try {
    const { negocio_id, local_id, rol, turno, email, password, password_hash } = req.body;
    const usuario = req.usuario;

    // Determinar negocio destino: si es admin, se fuerza su propio negocio; si es superadmin, puede elegir
    const negocioDestinoId = usuario.rol === 'admin' ? usuario.negocio_id : negocio_id;

    if (!negocioDestinoId) {
      return res.status(400).json({ message: "Debe especificarse negocio_id" });
    }

    if (usuario.rol !== 'admin' && usuario.rol !== 'superadmin') {
      return res.status(403).json({ message: "Solo administradores o superusuario pueden crear usuarios operativos" });
    }

    // No permitir crear usuarios superadmin desde aquí
    if (rol === 'superadmin') {
      return res.status(400).json({ message: "No se puede crear un usuario con rol superadmin" });
    }

    // Verificar negocio
    const negocioResult = await db.query(`SELECT nombre FROM negocios WHERE id = $1`, [negocioDestinoId]);
    if (negocioResult.rows.length === 0) {
      return res.status(404).json({ message: "Negocio no encontrado" });
    }
    const nombreNegocio = negocioResult.rows[0].nombre;

    // Generar nombre de usuario con formato rol.nombreNegocio-<negocio_id>
    let nombreUsuario = `${sanitizeForUsername(rol)}.${sanitizeForUsername(nombreNegocio)}-${negocioDestinoId}`;

    // Evitar colisiones dentro del mismo negocio: email o nombre
    const existsOp = await db.query(
      `SELECT id, email, nombre FROM usuarios WHERE negocio_id = $3 AND (email = $1 OR nombre = $2)`,
      [email, nombreUsuario, negocioDestinoId]
    );
    if (existsOp.rows.length) {
      const emailTaken = existsOp.rows.find(r => r.email === email);
      if (emailTaken) {
        return res.status(409).json({ message: 'Ya existe un usuario con ese email en este negocio', existing: emailTaken });
      }

      // Si el nombre base está tomado, generar uno único con sufijo
      const nombreTaken = existsOp.rows.find(r => r.nombre === nombreUsuario);
      if (nombreTaken) {
        nombreUsuario = await generarNombreUnico(nombreUsuario, negocioDestinoId);
      }
    }

    // Manejar password: aceptar password en claro o password_hash ya hasheada
    let storedHash;
    if (password_hash) {
      storedHash = password_hash;
    } else if (password) {
      storedHash = await bcrypt.hash(password, saltRounds);
    } else {
      return res.status(400).json({ message: "Se requiere 'password' o 'password_hash'" });
    }

    const result = await db.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, negocio_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nombre, email, rol, negocio_id`,
      [nombreUsuario, email, storedHash, rol, negocioDestinoId]
    );

    // Asociar el usuario al rol en user_roles
    const userId = result.rows[0].id;
    // Buscar el role_id por slug
    const roleRes = await db.query(
      `SELECT id FROM roles WHERE slug = $1 AND (negocio_id IS NULL OR negocio_id = $2)`,
      [rol, negocioDestinoId]
    );
    if (roleRes.rows.length > 0) {
      const roleId = roleRes.rows[0].id;
      await db.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, roleId]
      );
    }
    res.json({
      message: "Usuario operativo creado correctamente",
      usuario: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Listar todos los negocios (solo superadmin)
exports.getAll = async (req, res) => {
  try {
    const usuario = req.usuario;
    if (usuario.rol !== 'superadmin') {
      return res.status(403).json({ message: "Solo el superusuario puede ver todos los negocios" });
    }

    const result = await db.query(
      `SELECT n.*, a.id AS admin_id, a.email AS admin_email, a.nombre AS admin_nombre
       FROM negocios n
       LEFT JOIN LATERAL (
         SELECT id, email, nombre
         FROM usuarios
         WHERE negocio_id = n.id AND rol = 'admin'
         ORDER BY id ASC
         LIMIT 1
       ) a ON TRUE
       ORDER BY n.id ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Cambiar estado de negocio (solo superadmin)
exports.cambiarEstado = async (req, res) => {
  try {
    const usuario = req.usuario;
    if (usuario.rol !== 'superadmin') {
      return res.status(403).json({ message: "Solo el superusuario puede cambiar estado" });
    }

    const { id } = req.params;
    const { estado, motivo } = req.body;
    const estadosPermitidos = ['activo', 'suspendido', 'trial', 'baja'];
    if (!estadosPermitidos.includes(estado)) {
      return res.status(400).json({ message: 'Estado inválido' });
    }

    const result = await db.query(
      `UPDATE negocios SET estado = $1, motivo_estado = $2 WHERE id = $3 RETURNING *`,
      [estado, motivo || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Negocio no encontrado' });
    }

    await db.query(
      `INSERT INTO negocio_logs (negocio_id, usuario_id, accion, motivo)
       VALUES ($1, $2, $3, $4)`,
      [id, usuario.id, estado, motivo || null]
    );

    res.json({ message: 'Estado actualizado', negocio: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Resetear contraseña del admin principal de un negocio (solo superadmin)
exports.resetAdminPassword = async (req, res) => {
  try {
    const usuario = req.usuario;
    if (usuario.rol !== 'superadmin') {
      return res.status(403).json({ message: "Solo el superusuario puede resetear contraseñas de admins" });
    }

    const { id } = req.params;
    const { password, admin_id } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const adminResult = await db.query(
      `SELECT id, email FROM usuarios WHERE negocio_id = $1 AND rol = 'admin' ${admin_id ? 'AND id = $2' : ''} ORDER BY id ASC LIMIT 1`,
      admin_id ? [id, admin_id] : [id]
    );

    if (adminResult.rows.length === 0) {
      return res.status(404).json({ message: 'No hay admin asignado para este negocio' });
    }

    const admin = adminResult.rows[0];
    const password_hash = await bcrypt.hash(password, saltRounds);

    await db.query(`UPDATE usuarios SET password_hash = $1 WHERE id = $2`, [password_hash, admin.id]);

    const metadata = JSON.stringify({ admin_id: admin.id, admin_email: admin.email });

    await db.query(
      `INSERT INTO negocio_logs (negocio_id, usuario_id, accion, motivo, metadata)
       VALUES ($1, $2, $3, $4, $5)`
      ,
      [id, usuario.id, 'reset_password_admin', 'Reset de contraseña de admin', metadata]
    );

    res.json({ message: 'Contraseña reseteada', admin_id: admin.id, admin_email: admin.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Listar admins de un negocio (solo superadmin)
exports.listarAdmins = async (req, res) => {
  try {
    const usuario = req.usuario;
    if (usuario.rol !== 'superadmin') {
      return res.status(403).json({ message: "Solo el superusuario puede ver admins" });
    }

    const { id } = req.params;
    const result = await db.query(
      `SELECT id, email, nombre, rol
       FROM usuarios
       WHERE negocio_id = $1 AND rol = 'admin'
       ORDER BY id ASC`,
      [id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Listar logs de negocio (solo superadmin)
exports.logs = async (req, res) => {
  try {
    const usuario = req.usuario;
    if (usuario.rol !== 'superadmin') {
      return res.status(403).json({ message: "Solo el superusuario puede ver logs" });
    }

    const { id } = req.params;
    const result = await db.query(
      `SELECT l.id, l.accion, l.motivo, l.metadata, l.created_at, u.email as usuario_email
       FROM negocio_logs l
       LEFT JOIN usuarios u ON u.id = l.usuario_id
       WHERE l.negocio_id = $1
       ORDER BY l.created_at DESC`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Actualizar negocio (solo superadmin)
exports.updateNegocio = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre } = req.body;
    const usuario = req.usuario;

    if (usuario.rol !== 'superadmin') {
      return res.status(403).json({ message: "Solo el superusuario puede actualizar negocios" });
    }

    if (!nombre) {
      return res.status(400).json({ message: "El nombre del negocio es obligatorio" });
    }

    const result = await db.query(
      `UPDATE negocios
       SET nombre = $1
       WHERE id = $2
       RETURNING *`,
      [nombre, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Negocio no encontrado" });
    }

    res.json({ message: "Negocio actualizado correctamente", negocio: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Eliminar negocio (solo superadmin)
exports.deleteNegocio = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;

    if (usuario.rol !== 'superadmin') {
      return res.status(403).json({ message: "Solo el superusuario puede eliminar negocios" });
    }

    const result = await db.query(
      `DELETE FROM negocios WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Negocio no encontrado" });
    }

    res.json({ message: "Negocio eliminado correctamente", negocio: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};