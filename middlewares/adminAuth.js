module.exports = (req, res, next) => {
  const expected = process.env.ADMIN_TOKEN;
  const got = req.header('x-admin-token');

  if (!expected) {
    return res.status(500).json({ ok: false, error: 'Admin token tanımlı değil (ADMIN_TOKEN).' });
  }
  if (got !== expected) {
    return res.status(401).json({ ok: false, error: 'Yetkisiz. x-admin-token hatalı veya eksik.' });
  }
  next();
};