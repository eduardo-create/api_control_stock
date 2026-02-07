const db = require('../db');

const ALLOWED_STATUSES = new Set(['active', 'trial', 'trialing', 'past_due']);

async function fetchLatestSubscription(negocioId) {
  const { rows } = await db.query(
    `SELECT s.*, p.nombre AS plan_nombre, p.features AS plan_features, p.activo AS plan_activo
     FROM subscriptions s
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE s.negocio_id = $1
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [negocioId]
  );
  return rows[0] || null;
}

function normalizeFeatures(features) {
  if (!Array.isArray(features)) return null;
  return features
    .map(f => (f == null ? '' : String(f)).trim().toLowerCase())
    .filter(Boolean);
}

async function ensurePlanInfo(req) {
  if (req.planInfoLoaded) return req.planInfo;

  const negocioId = req.usuario && req.usuario.negocio_id;
  if (!negocioId) {
    const err = new Error('NEGOCIO_MISSING');
    throw err;
  }

  const sub = await fetchLatestSubscription(negocioId);
  const planInfo = sub
    ? {
        subscription: sub,
        plan: {
          nombre: sub.plan_nombre || null,
          features: sub.plan_features || null,
          activo: sub.plan_activo !== false
        }
      }
    : null;

  req.planInfo = planInfo;
  req.planInfoLoaded = true;
  return planInfo;
}

function isExpiredOrInactive(subscription, plan) {
  const now = new Date();
  const status = (subscription.status || '').toLowerCase();
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end) : null;
  const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end) : null;

  if (!plan || plan.activo === false) {
    return { expired: true, reason: 'Plan inactivo' };
  }

  if (!ALLOWED_STATUSES.has(status)) {
    return { expired: true, reason: 'Estado de suscripción inactivo' };
  }

  if (status.startsWith('trial') && trialEnd && now > trialEnd) {
    return { expired: true, reason: 'Trial vencido' };
  }

  if (periodEnd && now > periodEnd) {
    return { expired: true, reason: 'Período de facturación vencido' };
  }

  return { expired: false };
}

exports.requireActiveSubscription = async (req, res, next) => {
  // Superadmin no se valida por plan
  if (req.usuario && req.usuario.rol === 'superadmin') return next();

  try {
    const info = await ensurePlanInfo(req);
    if (!info) {
      return res.status(402).json({
        message: 'Negocio sin suscripción activa',
        code: 'subscription_missing'
      });
    }

    const { subscription, plan } = info;
    const check = isExpiredOrInactive(subscription, plan);
    if (check.expired) {
      return res.status(402).json({
        message: check.reason || 'Suscripción inactiva o vencida',
        code: 'subscription_inactive',
        status: subscription.status || null,
        trial_end: subscription.trial_end || null,
        current_period_end: subscription.current_period_end || null,
        plan: plan ? plan.nombre : null
      });
    }

    return next();
  } catch (err) {
    if (err && err.message === 'NEGOCIO_MISSING') {
      return res.status(400).json({ message: 'El usuario no tiene un negocio asociado' });
    }
    return res.status(500).json({ message: 'Error validando suscripción', error: err.message });
  }
};

exports.requireFeature = (featureKey, { skipIfNoFeatures = true } = {}) => {
  return async (req, res, next) => {
    if (req.usuario && req.usuario.rol === 'superadmin') return next();

    try {
      const info = await ensurePlanInfo(req);
      if (!info) {
        return res.status(402).json({
          message: 'Negocio sin suscripción activa',
          code: 'subscription_missing'
        });
      }

      if (!featureKey) return next();

      const features = normalizeFeatures(info.plan ? info.plan.features : null);
      if (!features || features.length === 0) {
        if (skipIfNoFeatures) return next();
        return res.status(403).json({ message: 'El plan no tiene features configuradas', code: 'feature_blocked' });
      }

      const wanted = String(featureKey).trim().toLowerCase();
      const allowed = features.includes('*') || features.includes('all') || features.includes(wanted);

      if (!allowed) {
        return res.status(403).json({
          message: `Tu plan no incluye el módulo ${featureKey}`,
          code: 'feature_blocked',
          feature: featureKey,
          plan: info.plan ? info.plan.nombre : null
        });
      }

      return next();
    } catch (err) {
      if (err && err.message === 'NEGOCIO_MISSING') {
        return res.status(400).json({ message: 'El usuario no tiene un negocio asociado' });
      }
      return res.status(500).json({ message: 'Error validando features del plan', error: err.message });
    }
  };
};
