// Avatar helpers: initial letter and one of four colour variants.

// Thai leading vowels are written before the consonant they follow in speech.
const LEADING_VOWELS = new Set(['เ', 'แ', 'โ', 'ใ', 'ไ']);

export function initialOf(name) {
  const chars = Array.from(String(name).trim()); // code-point aware
  const first = chars.find((c) => !LEADING_VOWELS.has(c));
  return first ?? chars[0] ?? '';
}

// djb2 over UTF-16 code units, folded to 32 bits.
export function avatarVariant(name) {
  const s = String(name);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return 'abcd'[h % 4];
}
