// Money helpers. Amounts are strings from the API; arithmetic is integer satang only.

const MAX_SATANG = 9999999999; // 99,999,999.99 baht
const INPUT_RE = /^\d*\.?\d{0,2}$/;

const thousands = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });

// "2500.00" -> "฿2,500", "150.50" -> "฿150.50"
export function formatBaht(amount) {
  const [intPart, frac = ''] = String(amount).split('.');
  const grouped = thousands.format(Number(intPart));
  return /[1-9]/.test(frac) ? `฿${grouped}.${frac.padEnd(2, '0').slice(0, 2)}` : `฿${grouped}`;
}

// Lenient parse of user-typed money into integer satang, or null when it is not a number.
function toSatang(raw) {
  const s = String(raw).trim().replace(/,/g, '');
  if (!INPUT_RE.test(s) || !/\d/.test(s)) return null;
  const [intPart = '', frac = ''] = s.split('.');
  const digits = intPart.replace(/^0+/, '');
  if (digits.length > 10) return Infinity; // far beyond the cap; avoids unsafe integer math
  return Number(digits || '0') * 100 + Number(frac.padEnd(2, '0'));
}

// Accepts a subset of what the server accepts; `value` always passes the server rules.
export function parseAmountInput(raw) {
  const satang = toSatang(raw);
  if (satang === null || satang <= 0 || satang > MAX_SATANG) return { ok: false };
  return { ok: true, value: formatSatang(satang, true) };
}

function formatSatang(satang, alwaysTwoDecimals) {
  const baht = Math.floor(satang / 100);
  const cents = satang % 100;
  if (cents === 0 && !alwaysTwoDecimals) return String(baht);
  return `${baht}.${String(cents).padStart(2, '0')}`;
}

// addBaht("150", 100) -> "250"; addBaht("150.5", 50) -> "200.50". Unparsable raw counts as 0.
export function addBaht(raw, baht) {
  const current = toSatang(raw);
  const base = current === null || !Number.isFinite(current) ? 0 : current;
  return formatSatang(base + Math.round(baht * 100), false);
}
