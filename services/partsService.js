const axios = require('axios');

function mockSearch(criteria) {
  const { marka, model, yil, parcaKodu } = criteria;
  // ÖRNEK veri: farklı şehir/durum/fiyat + telefon
  return {
    ok: true,
    criteria,
    matches: [
      {
        parcaAdi: 'Radyatör',
        oem: parcaKodu,
        stokKodu: 'DM79431',
        aracUyumluluk: [`${marka} ${model} ${yil}`],
        fiyatTL: 4500,
        doviz: 'TRY',
        durum: 'çıkma',
        sehir: 'İstanbul',
        tedarikci: 'Örnek Parçacı A',
        telefon: '905551112233',
        kargoSuresiGun: 2
      },
      {
        parcaAdi: 'Radyatör',
        oem: parcaKodu,
        stokKodu: '17117585440-NEW',
        aracUyumluluk: [`${marka} ${model} ${yil}`],
        fiyatTL: 6200,
        doviz: 'TRY',
        durum: 'sıfır',
        sehir: 'Bursa',
        tedarikci: 'Örnek Parçacı B',
        telefon: '905551114455',
        kargoSuresiGun: 1
      },
      {
        parcaAdi: 'Radyatör',
        oem: parcaKodu,
        stokKodu: '17117585440-RF',
        aracUyumluluk: [`${marka} ${model} ${yil}`],
        fiyatTL: 5200,
        doviz: 'TRY',
        durum: 'yenilenmiş',
        sehir: 'İzmir',
        tedarikci: 'Örnek Parçacı C',
        telefon: '905551116677',
        kargoSuresiGun: 3
      }
    ]
  };
}

async function searchParts(criteria) {
  const useMock = process.env.MOCK === '1' || !process.env.API_URL;
  if (useMock) return mockSearch(criteria);

  try {
    const resp = await axios.post(
      `${process.env.API_URL.replace(/\/+$/, '')}/search`,
      criteria,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.API_KEY ? { Authorization: `Bearer ${process.env.API_KEY}` } : {})
        },
        timeout: 10000
      }
    );
    return { ok: true, criteria, matches: resp.data?.matches || resp.data };
  } catch (err) {
    console.error('API çağrısı hatası:', err.message);
    return { ok: false, error: 'API çağrısı başarısız', detail: err.response?.data || err.message };
  }
}

module.exports = { searchParts };