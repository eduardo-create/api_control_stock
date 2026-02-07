const db = require('../db');

async function fetchLatestSubscription(negocioId) {
  const { rows } = await db.query(
    `SELECT s.*, p.nombre AS plan_nombre, p.precio AS plan_precio, p.intervalo AS plan_intervalo,
            p.features AS plan_features, p.activo AS plan_activo
     FROM subscriptions s
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE s.negocio_id = $1
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [negocioId]
  );
  return rows[0] || null;
}

async function fetchNegocio(negocioId) {
  const { rows } = await db.query(
    `SELECT id, nombre, creado_en FROM negocios WHERE id = $1`,
    [negocioId]
  );
  return rows[0] || null;
}

async function fetchLastInvoice(negocioId) {
  const { rows } = await db.query(
    `SELECT id, subscription_id, monto, due_date, pagado, pagado_en, created_at, meta
     FROM invoices
     WHERE negocio_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [negocioId]
  );
  return rows[0] || null;
}

function computeAlert(subscription) {
  if (!subscription) return { show: false, daysLeft: null, message: null };
  const now = new Date();
  const endStr = subscription.current_period_end || subscription.trial_end;
  if (!endStr) return { show: false, daysLeft: null, message: null };
  const endDate = new Date(endStr);
  const diffMs = endDate.getTime() - now.getTime();
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (daysLeft <= 7 && daysLeft >= 0) {
    return { show: true, daysLeft, message: `Tu suscripción vence en ${daysLeft} días` };
  }
  return { show: false, daysLeft, message: null };
}

exports.getMySubscription = async (req, res) => {
  try {
    const negocioId = req.usuario?.negocio_id;
    if (!negocioId) {
      return res.status(400).json({ message: 'El usuario no tiene un negocio asociado' });
    }

    const [negocio, subscription, lastInvoice] = await Promise.all([
      fetchNegocio(negocioId),
      fetchLatestSubscription(negocioId),
      fetchLastInvoice(negocioId)
    ]);

    const alert = computeAlert(subscription);

    return res.json({
      negocio,
      subscription,
      plan: subscription
        ? {
            nombre: subscription.plan_nombre,
            precio: subscription.plan_precio,
            intervalo: subscription.plan_intervalo,
            features: subscription.plan_features,
            activo: subscription.plan_activo !== false
          }
        : null,
      alert,
      lastInvoice
    });
  } catch (err) {
    return res.status(500).json({ message: 'Error al obtener suscripción', error: err.message });
  }
};

exports.reportPayment = async (req, res) => {
  try {
    const negocioId = req.usuario?.negocio_id;
    if (!negocioId) {
      return res.status(400).json({ message: 'El usuario no tiene un negocio asociado' });
    }

    const subscription = await fetchLatestSubscription(negocioId);
    if (!subscription) {
      return res.status(404).json({ message: 'No hay suscripción activa para reportar pago' });
    }

    const planAmount = Number(subscription.plan_precio);
    if (Number.isNaN(planAmount)) {
      return res.status(400).json({ message: 'El plan no tiene precio configurado' });
    }

    const { monto, referencia, fecha_pago } = req.body || {};
    const amountNum = Number(monto);
    if (Number.isNaN(amountNum)) {
      return res.status(400).json({ message: 'Monto inválido' });
    }

    const diff = Math.abs((amountNum || 0) - (planAmount || 0));
    if (diff > 0.01) {
      return res.status(400).json({ message: 'El monto debe coincidir con el precio del plan activo' });
    }
    if (planAmount > 0 && amountNum <= 0) {
      return res.status(400).json({ message: 'Monto debe ser mayor a 0' });
    }

    const meta = {
      reporte_pago: true,
      referencia: referencia || null,
      fecha_pago: fecha_pago || null
    };

    const { rows } = await db.query(
      `INSERT INTO invoices (subscription_id, negocio_id, monto, pagado, meta)
       VALUES ($1, $2, $3, FALSE, $4)
       RETURNING id, subscription_id, monto, pagado, created_at, meta`,
      [subscription.id, negocioId, amountNum, JSON.stringify(meta)]
    );

    return res.status(201).json({ message: 'Pago informado. Pendiente de confirmación.', invoice: rows[0] });
  } catch (err) {
    return res.status(500).json({ message: 'Error al informar pago', error: err.message });
  }
};
