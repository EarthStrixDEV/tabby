// Date helpers. API times are UTC ISO 8601; display is Asia/Bangkok, Buddhist calendar.

const LOCALE = 'th-TH-u-ca-buddhist';
const TZ = 'Asia/Bangkok';
const BANGKOK_OFFSET_MS = 7 * 3600 * 1000; // Asia/Bangkok has no DST, always UTC+7
const DAY_MS = 86400000;

const shortDate = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
const monthYear = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric', timeZone: TZ });

// Some ICU versions use NBSP / narrow NBSP between parts; the UI wants plain single spaces.
const plain = (s) => s.replace(/\s+/g, ' ').trim();

// Calendar fields of an instant as seen in Bangkok.
function bangkokParts(date) {
  const d = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const dayNumber = Math.floor(Date.UTC(y, m, day) / DAY_MS);
  const weekday = (d.getUTCDay() + 6) % 7; // Monday = 0
  return { monthIndex: y * 12 + m, dayNumber, weekStart: dayNumber - weekday };
}

export function groupLabel(iso, now) {
  const date = new Date(iso);
  const a = bangkokParts(date);
  const n = bangkokParts(now);
  if (a.dayNumber === n.dayNumber) return 'วันนี้';
  if (a.weekStart === n.weekStart) return 'สัปดาห์นี้';
  if (a.monthIndex === n.monthIndex) return 'เดือนนี้';
  if (a.monthIndex === n.monthIndex - 1) return 'เดือนที่แล้ว';
  return plain(monthYear.format(date));
}

export function formatShortDate(iso) {
  return plain(shortDate.format(new Date(iso)));
}
