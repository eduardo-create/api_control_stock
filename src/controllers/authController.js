const jwt = require('jsonwebtoken');
const db = require('../db');
const bcrypt = require('bcrypt');

exports.login = async (req, res) => {
  try {
    const { usuario, password } = req.body;

    const result = await db.query(`SELECT * FROM usuarios WHERE nombre = $1 OR email = $1`, [usuario]);
    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Usuario no encontrado" });
    }

    const user = result.rows[0];
    const passwordValida = await bcrypt.compare(password, user.password_hash);
    if (!passwordValida) {
      return res.status(401).json({ message: "Contraseña incorrecta" });
    }

    const permisosRes = await db.query(
      `SELECT DISTINCT p.slug
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       JOIN role_permissions rp ON rp.role_id = r.id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE ur.user_id = $1
         AND (r.negocio_id IS NULL OR r.negocio_id = $2)`
      ,
      [user.id, user.negocio_id || null]
    );

    let permissions = permisosRes.rows.map(r => r.slug);

    if (permissions.length === 0 && user.rol && user.rol !== 'superadmin') {
      const fallbackPerms = await db.query(
        `SELECT DISTINCT p.slug
         FROM roles r
         JOIN role_permissions rp ON rp.role_id = r.id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE r.slug = $1
           AND (r.negocio_id IS NULL OR r.negocio_id = $2)`,
        [user.rol, user.negocio_id || null]
      );
      permissions = fallbackPerms.rows.map(r => r.slug);
    }

    if ((user.rol === 'admin' || user.rol === 'superadmin') && permissions.length === 0) {
      const allPerms = await db.query('SELECT slug FROM permissions');
      permissions = allPerms.rows.map(r => r.slug);
    }

    const token = jwt.sign(
      {
        id: user.id,
        rol: user.rol,
        negocio_id: user.negocio_id,
        local_id: user.local_id,
        nombre_usuario: user.nombre,
        permissions
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Setear cookie HttpOnly (entorno local: secure false, SameSite Lax)
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 8 * 60 * 60 * 1000 // 8h
    });

    // Devolver también los datos del usuario (sin password_hash)
    const userData = {
      id: user.id,
      nombre: user.nombre,
      rol: user.rol,
      negocio_id: user.negocio_id,
      local_id: user.local_id,
      permissions
    };
    res.json({ token, user: userData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};