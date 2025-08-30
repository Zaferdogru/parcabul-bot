function buildWhatsAppLink({ phone, talepId, criteria, match, priceNote }) {
  if (!phone) return null;
  const normalized = String(phone).replace(/[^\d]/g, ''); // 9055...
  const lines = [
    `Talep ID: ${talepId}`,
    `Marka: ${criteria.marka}`,
    `Model: ${criteria.model}`,
    `Yıl: ${criteria.yil}`,
    `Parça: ${criteria.parcaKodu}`,
    criteria.sehir ? `Şehir: ${criteria.sehir}` : null,
    criteria.durum ? `Durum: ${criteria.durum}` : null,
    priceNote ? `Bütçe: ${priceNote}` : null,
    match?.parcaAdi ? `Parça Adı: ${match.parcaAdi}` : null
  ].filter(Boolean).join('\n');

  const encoded = encodeURIComponent(lines);
  return `https://wa.me/${normalized}?text=${encoded}`;
}

module.exports = { buildWhatsAppLink };