/** Matematiksel/stilize Unicode harflerini ASCII'ye indirger (ör. 𝐾𝑖𝑓𝑜𝑧 → Kifoz). */
const MATH_LETTER_BLOCKS: Array<{ start: number; upper: boolean }> = [
  { start: 0x1d400, upper: true },
  { start: 0x1d41a, upper: false },
  { start: 0x1d434, upper: true },
  { start: 0x1d44e, upper: false },
  { start: 0x1d468, upper: true },
  { start: 0x1d482, upper: false },
  { start: 0x1d49c, upper: true },
  { start: 0x1d4b6, upper: false },
  { start: 0x1d4d0, upper: true },
  { start: 0x1d4ea, upper: false },
  { start: 0x1d504, upper: true },
  { start: 0x1d51e, upper: false },
  { start: 0x1d538, upper: true },
  { start: 0x1d552, upper: false },
  { start: 0x1d56c, upper: true },
  { start: 0x1d586, upper: false },
  { start: 0x1d5a0, upper: true },
  { start: 0x1d5ba, upper: false },
  { start: 0x1d5d4, upper: true },
  { start: 0x1d5ee, upper: false },
  { start: 0x1d608, upper: true },
  { start: 0x1d622, upper: false },
  { start: 0x1d63c, upper: true },
  { start: 0x1d656, upper: false },
  { start: 0x1d670, upper: true },
  { start: 0x1d68a, upper: false },
];

function foldMathAlphanumericChar(codePoint: number): string | null {
  for (const block of MATH_LETTER_BLOCKS) {
    const offset = codePoint - block.start;
    if (offset >= 0 && offset < 26) {
      return String.fromCharCode((block.upper ? 65 : 97) + offset);
    }
  }
  if (codePoint >= 0xff21 && codePoint <= 0xff3a) {
    return String.fromCharCode(codePoint - 0xff21 + 65);
  }
  if (codePoint >= 0xff41 && codePoint <= 0xff5a) {
    return String.fromCharCode(codePoint - 0xff41 + 97);
  }
  return null;
}

function foldMathAlphanumeric(input: string): string {
  let out = '';
  for (const char of input) {
    const folded = foldMathAlphanumericChar(char.codePointAt(0)!);
    out += folded ?? char;
  }
  return out;
}

/** Pazar satıcı araması için isim normalizasyonu (Türkçe + stilize yazı). */
export function normalizeForNameSearch(input: string): string {
  let s = foldMathAlphanumeric(input);
  s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  s = s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

export function normalizeForNameSearchCompact(input: string): string {
  return normalizeForNameSearch(input).replace(/\s/g, '');
}
