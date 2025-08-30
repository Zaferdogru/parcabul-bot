const express = require('express');
const router = express.Router();
const Joi = require('joi');
const db = require('../db/db');
const { searchParts } = require('../services/partsService');

const trLower = (s) => (s || '').toLocaleLowerCase('tr');
const normPhone = (s) => String(s || '').replace(/[^\d]/g, '');
const normDurum = (d) => {
  const m = {
    'cikma': 'çıkma', 'çıkma': 'çıkma',
    'sifir': 'sıfır', 'sıfır': 'sıfır',
    'yenilenmis': 'yenilenmiş', 'yenilenmiş': 'yenilenmiş'
  };
  return m[trLower(d)] || trLower(d);
};

const schema = Joi.object({
  marka: Joi.string().trim().min(2).required(),
  model: Joi.string().trim().min(1).required(),
  yil: Joi.number().integer().min(1980).max(new Date().getFullYear() + 1).required(),
  parcaKodu: Joi.string().trim().min(3).required(),
  sehir: Joi.string().trim().min(2).optional(),
  durum: Joi.string().valid('çıkma','cikma','sıfır','sifir','yenilenmiş','yenilenmis').optional(),
  minFiyat: Joi.number().min(0).optional(),
  maxFiyat: Joi.number().min(0).optional()
});

router.post('/parca-sorgu', async (req, res) => {
  // 1) Validasyon
  const { error, value } = schema.validate(req.body, { abortEarly: false, convert: true });
  if (error) {
    return res.status(400).json({
      ok: false,
      error: 'Validasyon hatası',
      details: error.details.map(d => ({ message: d.message, path: d.path }))
    });
  }

  const criteria = { marka: value.marka, model: value.model, yil: value.yil, parcaKodu: value.parcaKodu };
  const filters = {
    sehir: value.sehir ? trLower(value.sehir) : null,
    durum: value.durum ? normDurum(value.durum) : null,
    minFiyat: typeof value.minFiyat === 'number' ? value.minFiyat : null,
    maxFiyat: typeof value.maxFiyat === 'number' ? value.maxFiyat : null
  };

  // 2) Kaynaktan sonuçları çek
  const apiResult = await searchParts(criteria);
  if (!apiResult.ok) {
    // Upstream hatasını geçir
    return res.status(502).json(apiResult);
  }
  let matches = Array.isArray(apiResult.matches) ? apiResult.matches.slice() : [];

  // 3) Vendors ile EŞLEŞTİR (telefon bazlı)
  const phones = [...new Set(matches.map(m => normPhone(m.telefon)).filter(Boolean))];
  let vendorMap = new Map();
  if (phones.length > 0) {
    const qs = phones.map(() => '?').join(',');
    await new Promise((resolve) => {
      db.all(
        `SELECT id, ad, telefon, sehir, durumlar FROM vendors WHERE telefon IN (${qs})`,
        phones,
        (err, rows) => {
          if (!err && Array.isArray(rows)) {
            for (const r of rows) {
              vendorMap.set(normPhone(r.telefon), {
                id: r.id,
                ad: r.ad,
                sehir: r.sehir || null,
                durumlar: r.durumlar ? JSON.parse(r.durumlar) : []
              });
            }
          }
          resolve();
        }
      );
    });
  }

  // 4) Vendor bilgisini maçlara uygula (şehir override + işaretleme)
  matches = matches.map(m => {
    const telNorm = normPhone(m.telefon);
    const v = telNorm ? vendorMap.get(telNorm) : null;
    const city = v?.sehir || m.sehir || null;
    return {
      ...m,
      telefon: telNorm || m.telefon,
      sehir: city,
      _vendorKnown: !!v,
      _vendor: v ? { id: v.id, ad: v.ad, sehir: v.sehir, durumlar: v.durumlar } : null
    };
  });

  // 5) Filtreler (şehir/durum/fiyat)
  if (filters.sehir) matches = matches.filter(m => trLower(m.sehir) === filters.sehir);
  if (filters.durum) matches = matches.filter(m => normDurum(m.durum) === filters.durum);
  if (filters.minFiyat !== null) matches = matches.filter(m => Number(m.fiyatTL) >= filters.minFiyat);
  if (filters.maxFiyat !== null) matches = matches.filter(m => Number(m.fiyatTL) <= filters.maxFiyat);

  // 6) Sıralama: Bilinen vendorlar önce, sonra fiyata göre artan
  matches.sort((a, b) => {
    if (a._vendorKnown !== b._vendorKnown) return a._vendorKnown ? -1 : 1;
    const af = Number(a.fiyatTL) || Infinity;
    const bf = Number(b.fiyatTL) || Infinity;
    return af - bf;
  });

  // 7) Meta/facets
  const currency = matches[0]?.doviz || 'TRY';
  const prices = matches.map(x => Number(x.fiyatTL)).filter(n => Number.isFinite(n));
  const total = matches.length;
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;
  const avg = prices.length ? Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100 : null;

  const facetCity = {};
  const facetDurum = {};
  for (const m of matches) {
    const city = trLower(m.sehir || '-');
    facetCity[city] = (facetCity[city] || 0) + 1;
    const d = normDurum(m.durum || '-');
    facetDurum[d] = (facetDurum[d] || 0) + 1;
  }

  // 8) Yanıt
  return res.json({
    ok: true,
    criteria: { ...criteria, ...filters },
    meta: {
      total,
      currency,
      price: { min, max, avg },
      vendorKnown: {
        known: matches.filter(m => m._vendorKnown).length,
        unknown: matches.filter(m => !m._vendorKnown).length
      }
    },
    facets: {
      sehir: facetCity,
      durum: facetDurum,
      priceOverall: { min, max }
    },
    matches: matches.map(m => ({
      parcaAdi: m.parcaAdi,
      oem: m.oem,
      stokKodu: m.stokKodu,
      aracUyumluluk: m.aracUyumluluk,
      fiyatTL: m.fiyatTL,
      doviz: m.doviz || 'TRY',
      durum: m.durum,
      sehir: m.sehir,
      tedarikci: m.tedarikci,
      telefon: m.telefon,
      kargoSuresiGun: m.kargoSuresiGun ?? null,
      vendor: m._vendor // {id,ad,sehir,durumlar} veya null
    }))
  });
});

module.exports = router;