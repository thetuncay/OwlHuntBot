/** Avcı Pazarı — opsiyonel satıcı notu doğrulama */

export const MARKET_SELLER_NOTE_MAX = 120;

const NOTE_PATTERN = /^[\p{L}\p{N}\s\-'.,!?;:()]+$/u;
const MENTION_RE = /<@!?\d+>|@everyone|@here/i;
const LINK_RE = /https?:\/\/|www\./i;

export function validateMarketSellerNote(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const value = raw.trim().replace(/\s+/g, ' ');
  if (!value) return null;
  if (value.length > MARKET_SELLER_NOTE_MAX) {
    throw new Error(`Satıcı notu en fazla **${MARKET_SELLER_NOTE_MAX}** karakter olabilir.`);
  }
  if (MENTION_RE.test(value) || LINK_RE.test(value) || /[@#]/.test(value)) {
    throw new Error('Satıcı notunda mention veya link kullanılamaz.');
  }
  if (!NOTE_PATTERN.test(value)) {
    throw new Error('Satıcı notu yalnızca harf, rakam ve temel noktalama içerebilir.');
  }
  return value;
}
