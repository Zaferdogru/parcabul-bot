const express = require('express');
const router = express.Router();
const db = require('../db/db');
const adminAuth = require('../middlewares/adminAuth');

const trLower = (s) => (s || '').toLocaleLowerCase('tr');

// PUBLIC: Liste (opsiyonel q, limit)
router.get('/vendors', (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));
  const q = (req.query.q || '').trim();

  const rowToObj = (r) => ({ ...r, durumlar: r.durumlar ? JSON.parse(r.durumlar) : [] });

  if (!q) {
    db.all(
      `SELECT id, ad, telefon, sehir, durumlar, created_at AS createdAt, updated_at AS updatedAt
       FROM vendors ORDER BY id DESC LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) return res.status(500).json({ ok: false, error: err.message });
        res.json({ ok: true, count: rows.length, vendors: rows.map(rowToObj) });
      }
    );
  } else {
    const pattern = `%${q}%`;
    db.all(
      `SELECT id, ad, telefon, sehir, durumlar, created_at AS createdAt, updated_at AS updatedAt
       FROM vendors
       WHERE ad LIKE ? OR telefon LIKE ? OR sehir LIKE ?
       ORDER BY id DESC LIMIT ?`,
      [pattern, pattern, pattern, limit],
      (err, rows) => {
        if (err) return res.status(500).json({ ok: false, error: err.message });
        res.json({ ok: true, count: rows.length, vendors: rows.map(rowToObj) });
      }
    );
  }
});

// ADMIN koruması
router.use(adminAuth);

// ADMIN: Ekle
router.post('/admin/vendors', (req, res) => {
  const { ad, telefon, sehir, durumlar } = req.body || {};
  if (!ad || !telefon) return res.status(400).json({ ok: false, error: 'ad ve telefon zorunlu' });

  let arr = [];
  if (Array.isArray(durumlar)) arr = durumlar;
  else if (typeof durumlar === 'string') arr = durumlar.split(',').map(s => s.trim()).filter(Boolean);

  const payload = JSON.stringify(arr.map(x => trLower(x)));
  const tel = String(telefon).replace(/[^\d]/g, '');

  db.run(
    `INSERT INTO vendors (ad, telefon, sehir, durumlar) VALUES (?, ?, ?, ?)`,
    [ad, tel, sehir || null, payload],
    function (err) {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      res.json({ ok: true, id: this.lastID });
    }
  );
});

// ADMIN: Güncelle
router.put('/admin/vendors/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'Geçersiz id' });

  const { ad, telefon, sehir, durumlar } = req.body || {};
  let arr = null;
  if (Array.isArray(durumlar)) arr = durumlar;
  else if (typeof durumlar === 'string') arr = durumlar.split(',').map(s => s.trim()).filter(Boolean);

  const updates = [];
  const params = [];

  if (ad != null) { updates.push('ad = ?'); params.push(ad); }
  if (telefon != null) { updates.push('telefon = ?'); params.push(String(telefon).replace(/[^\d]/g,'')); }
  if (sehir != null) { updates.push('sehir = ?'); params.push(sehir); }
  if (arr != null) { updates.push('durumlar = ?'); params.push(JSON.stringify(arr.map(x => trLower(x)))); }

  if (updates.length === 0) return res.status(400).json({ ok: false, error: 'Güncellenecek alan yok' });
  updates.push(`updated_at = datetime('now')`);

  db.run(
    `UPDATE vendors SET ${updates.join(', ')} WHERE id = ?`,
    [...params, id],
    function (err) {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      res.json({ ok: true, changes: this.changes });
    }
  );
});

// ADMIN: Sil
router.delete('/admin/vendors/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'Geçersiz id' });

  db.run(`DELETE FROM vendors WHERE id = ?`, [id], function (err) {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    res.json({ ok: true, changes: this.changes });
  });
});

module.exports = router;