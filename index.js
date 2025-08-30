require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const partsRouter = require('./routes/parts');
const talepRouter = require('./routes/talep');
const vendorsRouter = require('./routes/vendors');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// istek id + log
app.use((req, res, next) => {
  req.id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  res.setHeader('X-Request-Id', req.id);
  console.log(`[${req.id}] ${req.method} ${req.url}`);
  next();
});

app.use(cors());
app.use(express.json());

// statik dosyalar
app.use('/ui', express.static('public'));

// rate limit
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({ ok: false, error: 'Çok fazla istek. Lütfen sonra tekrar deneyin.' })
});

// sağlık
app.get('/health', (req, res) => res.json({ ok: true, envPort: PORT }));

// ana
app.get('/', (req, res) => res.send('Parcabul Bot Çalışıyor 🚀'));

// API
app.use('/api', apiLimiter, partsRouter);
app.use('/api', apiLimiter, talepRouter);
app.use('/api', apiLimiter, vendorsRouter);
app.use('/api', apiLimiter, adminRouter);

// 404
app.use((req, res) => res.status(404).json({ ok: false, error: 'Not Found' }));

// hata
app.use((err, req, res, next) => {
  console.error(`[${req.id || '-'}] Hata:`, err);
  res.status(500).json({ ok: false, error: 'Beklenmeyen bir hata oluştu.' });
});

// sunucu (0.0.0.0 dinler; deploy için uygun)
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});