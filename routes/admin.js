const express = require('express');
const router = express.Router();
const db = require('../db/db');
const adminAuth = require('../middlewares/adminAuth');

// Tüm admin endpointleri için token zorunlu
router.use(adminAuth);

// Son talepler
router.get('/admin/requests', (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 100));
  db.all(
    `SELECT talep_id AS talepId, musteri_ad AS musteriAd, musteri_telefon AS musteriTelefon, count, created_at AS createdAt
     FROM requests ORDER BY id DESC LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      res.json({ ok: true, items: rows });
    }
  );
});

// Bir talebin detayları
router.get('/admin/requests/:talepId', (req, res) => {
  const talepId = req.params.talepId;
  db.get(
    `SELECT talep_id AS talepId, musteri_ad AS musteriAd, musteri_telefon AS musteriTelefon,
            criteria_json AS criteriaJson, filter_json AS filterJson, count, created_at AS createdAt
     FROM requests WHERE talep_id = ?`,
    [talepId],
    (err, header) => {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      if (!header) return res.status(404).json({ ok: false, error: 'Talep bulunamadı' });

      db.all(
        `SELECT tedarikci, telefon, sehir, durum, fiyatTL, created_at AS createdAt
         FROM matches WHERE talep_id = ? ORDER BY id ASC`,
        [talepId],
        (err2, rows) => {
          if (err2) return res.status(500).json({ ok: false, error: err2.message });
          res.json({ ok: true, request: header, matches: rows });
        }
      );
    }
  );
});

module.exports = router;