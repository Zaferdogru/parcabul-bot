module.exports = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false, convert: true });
  if (error) {
    return res.status(400).json({
      ok: false,
      error: 'Validasyon hatası',
      details: error.details.map(d => ({ message: d.message, path: d.path }))
    });
  }
  req.validated = value;
  next();
};