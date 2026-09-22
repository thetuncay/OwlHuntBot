export const OWL_NICKNAME_CLEAR = 'clear';
export const OWL_NICKNAME_MIN = 2;
export const OWL_NICKNAME_MAX = 24;

const NICKNAME_PATTERN = /^[\p{L}\p{N}\s\-']+$/u;

export function isOwlNicknameClearCommand(value: string): boolean {
  return value.trim().toLowerCase() === OWL_NICKNAME_CLEAR;
}

export function validateOwlNickname(raw: string): { ok: true; value: string } | { ok: false; message: string } {
  const value = raw.trim();
  if (isOwlNicknameClearCommand(value)) {
    return { ok: false, message: 'Geçersiz isim. Temizlemek için `clear` komutunu kullan.' };
  }
  if (value.length < OWL_NICKNAME_MIN) {
    return { ok: false, message: `Takma ad en az **${OWL_NICKNAME_MIN}** karakter olmalı.` };
  }
  if (value.length > OWL_NICKNAME_MAX) {
    return { ok: false, message: `Takma ad en fazla **${OWL_NICKNAME_MAX}** karakter olabilir.` };
  }
  if (/[@#]/.test(value) || /https?:\/\//i.test(value)) {
    return { ok: false, message: 'Takma adda mention veya link kullanılamaz.' };
  }
  if (!NICKNAME_PATTERN.test(value)) {
    return { ok: false, message: 'Takma ad yalnızca harf, rakam, boşluk, `-` ve `\'` içerebilir.' };
  }
  return { ok: true, value };
}
