const express = require('express');
const router = express.Router();
const Joi = require('joi');
const db = require('../db/db');
const { searchParts } = require('../services/partsService');

const trLower = (s) => (s || '').toLocaleLowerCase('tr');
const normPhone = (s) => String(s || '').replace(/[^\d]/g, '');
const normDurum = (d) => {
  const m = { 'cikma':'çıkma','çıkma':'çıkma','sifir':'sıfır','sıfır':'sıfır','yenilenmis':'yenilenmiş','yenilenmiş':'yenilenmiş' };
  const k = trLower(d || '');
  return m[k] || k || null;
};

const schema = Joi.object({
  musteriAd: Joi.string().trim().min(2).required(),
  musteriTelefon: Joi.string().trim().min(8).required(),
  marka: Joi.string().trim().min(2).required(),
  model: Joi.string().trim().min(1).required(),
  yil: Joi.number().integer().min(1980).max(new Date().getFullYear() + 1).required(),
  parcaKodu: Joi.string().trim().min(3).required(),
  sehir: Joi.string().trim().min(2).optional(),
  durum: Joi.string().valid('çıkma','cikma','sıfır','sifir','yenilenmiş','yenilenmis').optional(),
  minFiyat: Joi.number().min(0).optional(),
  maxFiyat: Joi.number().min(0).optional(),
  // İsteğe bağlı: sadece bu telefonlara gönder
  vendorTelefonlar: Joi.alternatives(
    Joi.array().items(Joi.string()),
    Joi.string()
  ).optional(),
  // İsteğe bağlı: sadece bilinen vendorlara gönder
  onlyKnownVendors: Joi.boolean().optional()
});

function makeTalepId() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  const rand = Math.random().toString(36).slice(2,8).toUpperCase();
  return `REQ-${y}${m}${day}-${rand}`;
}

function buildWaLink(phone, talepId, payload, match) {
  const norm = normPhone(phone);
  const lines = [
    `Talep ID: ${talepId}`,
    `Marka: ${payload.marka}`,
    `Model: ${payload.model}`,
    `Yıl: ${payload.yil}`,
    `Parça: ${payload.parcaKodu}`,
    payload.sehir ? `Şehir: ${payload.sehir}` : null,
    payload.durum ? `Durum: ${payload.durum}` : null,
    typeof payload.minFiyat === 'number' ? `Bütçe: ${payload.minFiyat}- TRY` : null,
    match?.parcaAdi ? `Parça Adı: ${match.parcaAdi}` : null
  ].filter(Boolean).join('\n');
  return `https://wa.me/${norm}?text=${encodeURIComponent(lines)}`;
}

router.post('/talep', async (req, res) => {
  // 1) Validasyon
  const { error, value } = schema.validate(req.body, { abortEarly: false, convert: true });
  if (error) {
    return res.status(400).json({
      ok: false,
      error: 'Validasyon hatası',
      details: error.details.map(d => ({ message: d.message, path: d.path }))
    });
  }

  const payload = {
    musteriAd: value.musteriAd,
    musteriTelefon: normPhone(value.musteriTelefon),
    marka: value.marka, model: value.model, yil: value.yil, parcaKodu: value.parcaKodu,
    sehir: value.sehir ? trLower(value.sehir) : null,
    durum: value.durum ? normDurum(value.durum) : null,
    minFiyat: typeof value.minFiyat === 'number' ? value.minFiyat : null,
    maxFiyat: typeof value.maxFiyat === 'number' ? value.maxFiyat : null
  };

  // 2) Kaynaktan eşleşmeler
  const criteria = { marka: payload.marka, model: payload.model, yil: payload.yil, parcaKodu: payload.parcaKodu };
  const api = await searchParts(criteria);
  if (!api.ok) return res.status(502).json(api);
  let matches = Array.isArray(api.matches) ? api.matches.slice() : [];

  // 3) Vendors ile eşle (telefon bazlı)
  const phones = [...new Set(matches.map(m => normPhone(m.telefon)).filter(Boolean))];
  let vendorMap = new Map();
  if (phones.length) {
    const qs = phones.map(() => '?').join(',');
    await new Promise((resolve) => {
      db.all(
        `SELECT id, ad, telefon, sehir, durumlar FROM vendors WHERE telefon IN (${qs})`,
        phones,
        (err, rows) => {
          if (!err && Array.isArray(rows)) {
            for (const r of rows) {
              vendorMap.set(normPhone(r.telefon), {
                id: r.id, ad: r.ad, sehir: r.sehir || null,
                durumlar: r.durumlar ? JSON.parse(r.durumlar) : []
              });
            }
          }
          resolve();
        }
      );
    });
  }

  // 4) Vendor bilgisini maçlara ekle + şehir override
  matches = matches.map(m => {
    const tel = normPhone(m.telefon);
    const v = tel ? vendorMap.get(tel) : null;
    return {
      ...m,
      telefon: tel || m.telefon,
      sehir: v?.sehir || m.sehir || null,
      _vendorKnown: !!v,
      _vendor: v ? { id: v.id, ad: v.ad, sehir: v.sehir, durumlar: v.durumlar } : null
    };
  });

  // 5) Filtreler (gönderim kapsamı için)
  if (payload.sehir) matches = matches.filter(m => trLower(m.sehir) === payload.sehir);
  if (payload.durum) matches = matches.filter(m => normDurum(m.durum) === payload.durum);
  if (payload.minFiyat !== null) matches = matches.filter(m => Number(m.fiyatTL) >= payload.minFiyat);
  if (payload.maxFiyat !== null) matches = matches.filter(m => Number(m.fiyatTL) <= payload.maxFiyat);

  // 6) İsteğe bağlı: sadece belirli telefonlara gönder
  let whitelist = null;
  if (value.vendorTelefonlar) {
    const arr = Array.isArray(value.vendorTelefonlar)
      ? value.vendorTelefonlar
      : String(value.vendorTelefonlar).split(',').map(s => s.trim());
    whitelist = new Set(arr.map(normPhone).filter(Boolean));
    matches = matches.filter(m => whitelist.has(normPhone(m.telefon)));
  }

  // 7) İsteğe bağlı: sadece bilinen vendorlar
  if (value.onlyKnownVendors) {
    matches = matches.filter(m => m._vendorKnown);
  }

  // 8) Sıralama: bilinen vendorlar önce, ardından fiyat artan
  matches.sort((a, b) => {
    if (a._vendorKnown !== b._vendorKnown) return a._vendorKnown ? -1 : 1;
    const af = Number(a.fiyatTL) || Infinity;
    const bf = Number(b.fiyatTL) || Infinity;
    return af - bf;
  });

  // 9) Talep kaydı
  const talepId = makeTalepId();
  const criteriaJson = JSON.stringify(criteria);
  const filterJson = JSON.stringify({
    sehir: payload.sehir, durum: payload.durum,
    minFiyat: payload.minFiyat, maxFiyat: payload.maxFiyat,
    vendorTelefonlar: whitelist ? Array.from(whitelist) : null,
    onlyKnownVendors: !!value.onlyKnownVendors
  });

  await new Promise((resolve) => {
    db.run(
      `INSERT INTO requests (talep_id, musteri_ad, musteri_telefon, criteria_json, filter_json, count)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [talepId, payload.musteriAd, payload.musteriTelefon, criteriaJson, filterJson, matches.length],
      () => resolve()
    );
  });

  // 10) Matches tablosuna yaz (ön izleme için)
  if (matches.length) {
    const stmt = db.prepare(
      `INSERT INTO matches (talep_id, tedarikci, telefon, sehir, durum, fiyatTL) VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const m of matches) {
      stmt.run(talepId, m.tedarikci || '-', normPhone(m.telefon), m.sehir || null, normDurum(m.durum), Number(m.fiyatTL) || null);
    }
    stmt.finalize();
  }

  // 11) Gönderim listesi (şimdilik WA link üretimi)
  const toSend = matches.map(m => ({
    tedarikci: m._vendor?.ad || m.tedarikci || 'Parçacı',
    telefon: normPhone(m.telefon),
    sehir: m.sehir || null,
    durum: normDurum(m.durum),
    fiyatTL: m.fiyatTL ?? null,
    whatsappLink: buildWaLink(m.telefon, talepId, payload, m)
  }));

  return res.json({
    ok: true,
    talepId,
    musteri: { ad: payload.musteriAd, telefon: payload.musteriTelefon },
    criteria: {
      marka: payload.marka, model: payload.model, yil: payload.yil, parcaKodu: payload.parcaKodu,
      sehir: payload.sehir, durum: payload.durum, minFiyat: payload.minFiyat, maxFiyat: payload.maxFiyat
    },
    count: toSend.length,
    toSend,
    note: 'Önizleme: Gönderim yapılmadı. WhatsApp Business API eklenince gerçek gönderim yapılacak.'
  });
});

module.exports = router;