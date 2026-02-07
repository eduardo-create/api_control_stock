const db = require('../db');
const bcrypt = require('bcrypt');

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Los roles se acotan a negocio; 'superadmin' solo se crea vía flujo de superadmin (negociosController.asignarAdministrador)
const rolesPermitidos = ['admin', 'caja', 'cajero', 'vendedor', 'encargado', 'consulta'];

function validarPayloadUsuario({ nombre, email, password, rol, local_id }, { esUpdate = false } = {}) {
  if (!esUpdate) {
    if (!nombre || !email || !password || !rol) {
      return 'Nombre, email, contraseña y rol son obligatorios';
    }
    if (!password || password.length < 6) {
      return 'La contraseña debe tener al menos 6 caracteres';
    }
  }
  if (email && !emailRegex.test(email)) {
    return 'Email inválido';
  }
  if (rol && !rolesPermitidos.includes(rol)) {
    return 'Rol inválido';
  }
  if (local_id !== undefined && local_id !== null && Number.isNaN(Number(local_id))) {
    return 'local_id debe ser numérico';
  }
  return null;
}

// Resetear contraseña de usuario (admin o superadmin)
exports.updatePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    const usuario = req.usuario;
    if (usuario.rol !== 'admin' && usuario.rol !== 'superadmin') {
      return res.status(403).json({ message: "No tienes permiso para cambiar contraseñas" });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres" });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      `UPDATE usuarios SET password_hash=$1 WHERE id=$2 AND negocio_id=$3 RETURNING id` ,
      [password_hash, id, usuario.negocio_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado o no pertenece a tu negocio" });
    }
    res.json({ message: "Contraseña actualizada" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Crear usuario (admin o superadmin)
exports.create = async (req, res) => {
  try {
    const { nombre, email, password, rol, local_id } = req.body;
    const usuario = req.usuario;

    if (usuario.rol !== 'admin' && usuario.rol !== 'superadmin') {
      return res.status(403).json({ message: "No tienes permiso para crear usuarios" });
    }

    if (rol === 'superadmin') {
      return res.status(400).json({ message: "El rol superadmin solo puede ser creado por el flujo de negocios (superadmin)" });
    }

    const errorValidacion = validarPayloadUsuario({ nombre, email, password, rol, local_id }, { esUpdate: false });
    if (errorValidacion) {
      return res.status(400).json({ message: errorValidacion });
    }

    // Hashear la contraseña antes de guardar
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    const result = await db.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, negocio_id, local_id, activo)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING id, nombre, email, rol, negocio_id, local_id, activo`,
      [nombre, email, password_hash, rol, usuario.negocio_id, local_id]
    );

      // Asociar el usuario al rol en user_roles
      const userId = result.rows[0].id;
      // Buscar el role_id por slug
      const roleRes = await db.query(
        `SELECT id FROM roles WHERE slug = $1 AND (negocio_id IS NULL OR negocio_id = $2)`,
        [rol, usuario.negocio_id]
      );
      if (roleRes.rows.length > 0) {
        const roleId = roleRes.rows[0].id;
        await db.query(
          `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [userId, roleId]
        );
      }
      res.status(201).json({ message: "Usuario creado correctamente", usuario: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') { // Restricción única
      const constraint = err.constraint || '';
      if (constraint.includes('nombre')) {
        return res.status(400).json({ message: "El nombre de usuario ya existe en este negocio." });
      }
      if (constraint.includes('email')) {
        return res.status(400).json({ message: "El email ya existe en este negocio." });
      }
      return res.status(400).json({ message: "Ya existe un usuario con esos datos en este negocio." });
    }
    res.status(500).json({ error: err.message });
  }
};

// Listar usuarios de un negocio
exports.getAll = async (req, res) => {
  try {
    const usuario = req.usuario;

    if (usuario.rol !== 'admin' && usuario.rol !== 'superadmin') {
      return res.status(403).json({ message: "No tienes permiso para ver usuarios" });
    }

    const result = await db.query(
      `SELECT id, nombre, email, rol, local_id, activo
       FROM usuarios
       WHERE negocio_id = $1
       ORDER BY id ASC`,
      [usuario.negocio_id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Obtener usuario por ID
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;

    if (usuario.rol !== 'admin' && usuario.rol !== 'superadmin') {
      return res.status(403).json({ message: "No tienes permiso para ver usuarios" });
    }

    const result = await db.query(
      `SELECT id, nombre, email, rol, local_id, activo
       FROM usuarios
       WHERE id = $1 AND negocio_id = $2`,
      [id, usuario.negocio_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Actualizar usuario
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, email, rol, local_id, activo } = req.body;
    const usuario = req.usuario;

    if (usuario.rol !== 'admin' && usuario.rol !== 'superadmin') {
      return res.status(403).json({ message: "No tienes permiso para actualizar usuarios" });
    }

    const errorValidacion = validarPayloadUsuario({ nombre, email, rol, local_id }, { esUpdate: true });
    if (errorValidacion) {
      return res.status(400).json({ message: errorValidacion });
    }

    const result = await db.query(
      `UPDATE usuarios
       SET nombre=$1, email=$2, rol=$3, local_id=$4, activo=$5
       WHERE id=$6 AND negocio_id=$7
       RETURNING *`,
      [nombre, email, rol, local_id, activo, id, usuario.negocio_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado o no pertenece a tu negocio" });
    }

    res.json({ message: "Usuario actualizado correctamente", usuario: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Eliminar usuario
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario;

    if (usuario.rol !== 'admin' && usuario.rol !== 'superadmin') {
      return res.status(403).json({ message: "No tienes permiso para eliminar usuarios" });
    }

    const result = await db.query(
      `DELETE FROM usuarios
       WHERE id=$1 AND negocio_id=$2
       RETURNING *`,
      [id, usuario.negocio_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado o no pertenece a tu negocio" });
    }

    res.json({ message: "Usuario eliminado correctamente", usuario: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};