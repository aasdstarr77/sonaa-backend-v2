function normalizePhone(phone) {
  if (!phone) return null;
  let p = String(phone).trim().replace(/\s+/g, '');
  if (p.startsWith('+20')) p = '0' + p.slice(3);
  if (p.startsWith('0020')) p = '0' + p.slice(4);
  if (p.startsWith('20') && p.length === 12) p = '0' + p.slice(2);
  if (!/^01[0-9]{9}$/.test(p)) return null;
  return p;
}
function isValidVodafoneCashNumber(num) { return !!normalizePhone(num); }
module.exports = { normalizePhone, isValidVodafoneCashNumber };
