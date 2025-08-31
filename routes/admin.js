const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { runBackup } = require('../scripts/backup');

/**
 * Basit admin doğrulama (header: x-admin-token)
 * .env içindeki ADMIN_TOKEN ile eşleşmeli.
 */
function adminAuth(req, res, next) {
  const token = req.header('x-admin-token');
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: 'Yetkisiz. x-admin-token hatalı veya eksik.' });
  }
  next();
}

/**
 * Yardımcı: request satırını düzenli objeye çevir
 */
function mapRequestRow(r) {
  return {
    talepId: r.talep_id,
    musteriAd: r.musteri_ad,
    musteriTelefon: r.musteri_telefon,
    count: r.count,
    createdAt: r.created_at
  };
}

/**
 * GET /api/admin/requests
 * Son talepleri listeler (desc). ?limit=50 gibi kullanabilirsin.
 */
router.get('/admin/requests', adminAuth, (req, res) => {
  const limit = Math.max(1, Math.min(parseInt(req.query.limit || '100', 10) || 100, 500));
  db.all(
    `SELECT talep_id, musteri_ad, musteri_telefon, count,
            strftime('%Y-%m-%d %H:%M:%S', created_at) AS created_at
       FROM requests
      ORDER BY datetime(created_at) DESC
      LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) {
        console.error('DB error /admin/requests:', err);
        return res.status(500).json({ ok: false, error: 'DB hatası' });
      }
      const items = (rows || []).map(mapRequestRow);
      return res.json({ ok: true, items });
    }
  );
});

/**
 * GET /api/admin/requests/:talepId
 * Talep detayını + eşleşen parçacı kayıtlarını getirir.
 */
router.get('/admin/requests/:talepId', adminAuth, (req, res) => {
  const talepId = String(req.params.talepId || '').trim();
  if (!talepId) return res.status(400).json({ ok: false, error: 'Geçersiz talepId' });

  db.get(
    `SELECT talep_id, musteri_ad, musteri_telefon, criteria_json, filter_json, count,
            strftime('%Y-%m-%d %H:%M:%S', created_at) AS created_at
       FROM requests
      WHERE talep_id = ?
      LIMIT 1`,
    [talepId],
    (err, row) => {
      if (err) {
        console.error('DB error /admin/requests/:id get:', err);
        return res.status(500).json({ ok: false, error: 'DB hatası' });
      }
      if (!row) return res.status(404).json({ ok: false, error: 'Talep bulunamadı' });

      db.all(
        `SELECT tedarikci, telefon, sehir, durum, fiyatTL,
                strftime('%Y-%m-%d %H:%M:%S', created_at) AS created_at
           FROM matches
          WHERE talep_id = ?
       ORDER BY (fiyatTL IS NULL) ASC, fiyatTL ASC`,
        [talepId],
        (err2, rows) => {
          if (err2) {
            console.error('DB error /admin/requests/:id matches:', err2);
            return res.status(500).json({ ok: false, error: 'DB hatası' });
          }

          let criteria = null;
          let filters = null;
          try { criteria = row.criteria_json ? JSON.parse(row.criteria_json) : null; } catch {}
          try { filters = row.filter_json ? JSON.parse(row.filter_json) : null; } catch {}

          return res.json({
            ok: true,
            request: {
              talepId: row.talep_id,
              musteriAd: row.musteri_ad,
              musteriTelefon: row.musteri_telefon,
              criteria,
              filters,
              count: row.count,
              createdAt: row.created_at
            },
            matches: (rows || []).map(m => ({
              tedarikci: m.tedarikci,
              telefon: m.telefon,
              sehir: m.sehir,
              durum: m.durum,
              fiyatTL: m.fiyatTL,
              createdAt: m.created_at
            }))
          });
        }
      );
    }
  );
});

/**
 * POST /api/admin/backup
 * Tek tıkla yedek alır; çıktı dizini data/backups (kalıcı disk içinde).
 */
router.post('/admin/backup', adminAuth, (req, res) => {
  try {
    const info = runBackup(); // { ok, saved: [...], ... }
    return res.json({ ok: true, ...info });
  } catch (e) {
    console.error('Backup error:', e);
    return res.status(500).json({ ok: false, error: e.message || 'Backup hatası' });
  }
});

module.exports = router;