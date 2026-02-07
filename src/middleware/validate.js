const Joi = require('joi');

function validate(schema, property = 'body') {
  return (req, res, next) => {
    const data = req[property] || {};
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      return res.status(400).json({
        message: 'Datos inválidos',
        detalles: error.details.map(d => d.message)
      });
    }

    // Sobrescribe con datos saneados
    req[property] = value;
    return next();
  };
}

module.exports = { validate, Joi };
