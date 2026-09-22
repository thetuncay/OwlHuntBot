/**
 * theme.ts — OwlHuntBot Merkezi Tema Sistemi
 *
 * Tüm bot çıktıları bu dosyadaki sabitler ve yardımcıları kullanır.
 * Tema değişikliği için sadece bu dosyayı düzenlemek yeterlidir.
 *
 * Tasarım ilkeleri (klasik hunt bot ilhamı):
 *   - Düz text öncelikli, embed ikincil
 *   - | ile başlayan satırlar (hunt, pvp, slot)
 *   - Monospace barlar: ▰▱ (charge), █░ (HP/progress)
 *   - Superscript miktarlar: ⁰¹ ⁰² (inventory grid)
 *   - Başlık çizgisi: ══ Title ══
 *   - Hata: ✗  Başarı: ✓  Uyarı: ⚠
 */

// ─── Renkler ──────────────────────────────────────────────────────────────────

export const COLORS = {
  // Temel — site markası (#9b1c1c / #dc2626 / #f5c518)
  PRIMARY:   0x9B1C1C, // OwlHunt kırmızı — genel bilgi
  SUCCESS:   0x57F287, // Yeşil — başarı (Discord yeşili, okunaklı)
  DANGER:    0xDC2626, // Kırmızı — hata / kayıp
  WARNING:   0xF5C518, // Altın — uyarı
  MUTED:     0x4F545C, // Koyu gri — iptal / pasif

  // Oyun
  HUNT:      0x1A1212, // Koyu yüzey — hunt
  RARE:      0xF5C518, // Altın — nadir
  PVP_WIN:   0xDC2626, // Kırmızı — PvP kazanma
  PVP_LOSE:  0x4F545C, // Gri — PvP kaybetme
  UPGRADE:   0x9B1C1C, // Kırmızı — upgrade
  INVENTORY: 0x9B1C1C, // Kırmızı — envanter
  STATS:     0x9B1C1C, // Kırmızı — stats
  BUFF:      0xC9A012, // Koyu altın — aktif buff
  TAME:      0x9B1C1C, // Kırmızı — tame
  MARKET:    0xC9A012, // Altın — market
  PRESTIGE:  0xF5C518, // Altın — prestige
  JOURNAL:   0x1A1212, // Koyu defter yüzeyi — Avcı Defteri

  // Tier renkleri (encounter)
  TIER: [0, 0xE74C3C, 0xE67E22, 0xF1C40F, 0x2ECC71, 0x3498DB, 0x9B59B6, 0x95A5A6, 0x7F8C8D] as number[],
} as const;

/** Baykuş kalite rozeti — registry dışı, düz Unicode */
export const QUALITY_MARK: Record<string, string> = {
  Trash: '⬛',
  Common: '⬜',
  Good: '🟩',
  Rare: '🟦',
  Elite: '🟪',
  'God Roll': '🌟',
};

export function qualityMark(quality: string): string {
  return QUALITY_MARK[quality] ?? '⬜';
}

// ─── Barlar ───────────────────────────────────────────────────────────────────

/**
 * HP / progress barı — █░ karakterleri
 * @param current Mevcut değer
 * @param max Maksimum değer
 * @param length Bar uzunluğu (segment sayısı)
 */
export function hpBar(current: number, max: number, length = 10): string {
  const ratio  = max > 0 ? Math.min(Math.max(current / max, 0), 1) : 0;
  const filled = Math.round(ratio * length);
  return `${'█'.repeat(filled)}${'░'.repeat(length - filled)}`;
}

/**
 * Charge barı — ▰▱ karakterleri (pipe tarzı)
 */
export function chargeBar(current: number, max: number, length = 10): string {
  const ratio  = max > 0 ? Math.min(Math.max(current / max, 0), 1) : 0;
  const filled = Math.round(ratio * length);
  return `${'▰'.repeat(filled)}${'▱'.repeat(length - filled)}`;
}

/**
 * Şans barı — renkli nokta + █░
 */
export function chanceBar(chance: number, length = 10): string {
  const filled = Math.round((chance / 100) * length);
  const dot    = chance >= 70 ? '🟢' : chance >= 40 ? '🟡' : '🔴';
  return `${dot} \`${'█'.repeat(filled)}${'░'.repeat(length - filled)}\` **${chance.toFixed(1)}%**`;
}

/**
 * HP barı — renkli gösterge + monospace bar
 */
export function hpBarColored(hp: number, hpMax: number, length = 8): string {
  const pct    = Math.max(0, Math.min(hp / hpMax, 1));
  const filled = Math.round(pct * length);
  const color  = pct > 0.5 ? '🟩' : pct > 0.25 ? '🟨' : '🟥';
  return `${color}\`${'█'.repeat(filled)}${'░'.repeat(length - filled)}\` **${hp}**`;
}

/**
 * Slot barı — doluluk göstergesi
 */
export function slotBar(used: number, total: number, length = 10): string {
  const pct    = total > 0 ? Math.min(Math.max(used / total, 0), 1) : 0;
  const filled = Math.round(pct * length);
  const warn   = pct >= 0.9 ? ' ⚠️' : '';
  return `\`${'█'.repeat(filled)}${'░'.repeat(length - filled)}\` ${used}/${total}${warn}`;
}

// ─── Başlık çizgisi ───────────────────────────────────────────────────────────

/**
 * Pipe tarzı başlık: ══ Title ══
 */
export function sectionTitle(title: string, width = 36): string {
  const inner = ` ${title} `;
  const pad   = Math.max(0, Math.floor((width - inner.length) / 2));
  return `${'═'.repeat(pad)}${inner}${'═'.repeat(pad)}`;
}

// ─── Superscript ─────────────────────────────────────────────────────────────

const SUP_DIGITS = ['⁰','¹','²','³','⁴','⁵','⁶','⁷','⁸','⁹'];

/**
 * Sayıyı superscript karakterlere çevirir: 6 → ⁰⁶
 */
export function toSuperscript(n: number): string {
  return String(Math.min(n, 99)).padStart(2, '0')
    .split('')
    .map((c) => SUP_DIGITS[parseInt(c)] ?? c)
    .join('');
}

/** Zoo miktarı — 0–9999, sabit basamak yok. */
export function toSuperscriptQty(n: number, max = 9999): string {
  const v = Math.min(Math.max(0, Math.floor(n)), max);
  return String(v)
    .split('')
    .map((c) => SUP_DIGITS[parseInt(c)] ?? c)
    .join('');
}

// ─── Hata / Başarı satırları ──────────────────────────────────────────────────

/** ✗ Hata satırı */
export function errLine(msg: string): string {
  return `✗ ${msg}`;
}

/** ✓ Başarı satırı */
export function okLine(msg: string): string {
  return `✓ ${msg}`;
}

/** ⚠ Uyarı satırı */
export function warnLine(msg: string): string {
  return `⚠ ${msg}`;
}

/** 🌙 | Pipe satırı (hunt çıktıları için) */
export function pipeLine(msg: string): string {
  return `🌙 | ${msg}`;
}

/** OwO tarzı charge göstergesi — Discord inline code kutusu */
export function chargeBadge(cur: number, max: number): string {
  return `\`[${cur}/${max}]\``;
}

/** Tek değer inline code (XP, coin miktarı vb.) */
export function inlineAmount(value: number | string): string {
  return `\`${value}\``;
}

// ─── Charge göstergesi ────────────────────────────────────────────────────────

/**
 * Charge durumu renk noktası
 */
export function chargeDot(current: number, max: number): string {
  const pct = max > 0 ? current / max : 0;
  return pct > 0.5 ? '🟢' : pct > 0.2 ? '🟡' : '🔴';
}

// ─── Rarity badge ─────────────────────────────────────────────────────────────

export const RARITY_BADGE: Record<string, string> = {
  Legendary: '🟡',
  Epic:      '🟣',
  Rare:      '🔵',
  Uncommon:  '🔹',
  Common:    '',
};

export const RARITY_COLOR: Record<string, number> = {
  Legendary: 0xF5C518,
  Epic:      0xC9A012,
  Rare:      0x9B1C1C,
  Uncommon:  0x4F545C,
  Common:    0x4F545C,
};

/** Rarity noktası — kutu açma ve envanter listelerinde satır işareti. */
export const RARITY_DOT: Record<string, string> = {
  Legendary: '🟡',
  Epic:      '🟣',
  Rare:      '🔵',
  Uncommon:  '🔹',
  Common:    '⚪',
};

/**
 * Rarity noktasını verir; bilinmeyen rarity yaygın sayılır.
 *
 * @param rarity Rarity adı (`Legendary` … `Common`)
 */
export function rarityDot(rarity: string): string {
  return RARITY_DOT[rarity] ?? RARITY_DOT.Common!;
}

/** Rarity sıralama ağırlığı — büyük sayı daha nadir (azalan sıralama için). */
export const RARITY_RANK: Record<string, number> = {
  Legendary: 4,
  Epic:      3,
  Rare:      2,
  Uncommon:  1,
  Common:    0,
};

/**
 * Rarity sıralama ağırlığı.
 *
 * @param rarity Rarity adı
 */
export function rarityRank(rarity: string): number {
  return RARITY_RANK[rarity] ?? 0;
}

// ─── Kalite badge ─────────────────────────────────────────────────────────────

export const QUALITY_BADGE: Record<string, string> = {
  'Trash':    '⬛',
  'Common':   '⬜',
  'Good':     '🟩',
  'Rare':     '🟦',
  'Elite':    '🟪',
  'God Roll': '🌟',
};

export const QUALITY_COLOR: Record<string, number> = {
  'Trash':    COLORS.MUTED,
  'Common':   COLORS.PRIMARY,
  'Good':     COLORS.PRIMARY,
  'Rare':     COLORS.PRIMARY,
  'Elite':    COLORS.RARE,
  'God Roll': COLORS.RARE,
};

// ─── Tier label ───────────────────────────────────────────────────────────────

export const TIER_LABEL: Record<number, string> = {
  1: 'T1 ◆◆◆◆◆◆◆◆',
  2: 'T2 ◆◆◆◆◆◆◆◇',
  3: 'T3 ◆◆◆◆◆◆◇◇',
  4: 'T4 ◆◆◆◆◆◇◇◇',
  5: 'T5 ◆◆◆◆◇◇◇◇',
  6: 'T6 ◆◆◆◇◇◇◇◇',
  7: 'T7 ◆◆◇◇◇◇◇◇',
  8: 'T8 ◆◇◇◇◇◇◇◇',
};

// ─── Embed yardımcıları ───────────────────────────────────────────────────────

import { EmbedBuilder } from 'discord.js';

/** Başarı embed'i */
export function successEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(`✓ ${title}`)
    .setDescription(description);
}

/** Hata embed'i */
export function failEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.DANGER)
    .setTitle(`✗ ${title}`)
    .setDescription(description);
}

/** Bilgi embed'i */
export function infoEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(title)
    .setDescription(description);
}

/** Uyarı embed'i */
export function warningEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle(`⚠ ${title}`)
    .setDescription(description);
}
