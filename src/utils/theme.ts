/**
 * theme.ts — OwlHuntBot Merkezi Tema Sistemi
 *
 * Tüm bot çıktıları bu dosyadaki sabitler ve yardımcıları kullanır.
 * Tema değişikliği için sadece bu dosyayı düzenlemek yeterlidir.
 *
 * Tasarım ilkeleri (OwO ilhamı):
 *   - Düz text öncelikli, embed ikincil
 *   - | ile başlayan satırlar (hunt, pvp, slot)
 *   - Monospace barlar: ▰▱ (charge), █░ (HP/progress)
 *   - Superscript miktarlar: ⁰¹ ⁰² (inventory grid)
 *   - Başlık çizgisi: ══ Title ══
 *   - Hata: ✗  Başarı: ✓  Uyarı: ⚠
 */

// ─── Renkler ──────────────────────────────────────────────────────────────────

export const COLORS = {
  // Temel
  PRIMARY:   0x5865F2, // Discord blurple — genel bilgi
  SUCCESS:   0x57F287, // Yeşil — başarı
  DANGER:    0xED4245, // Kırmızı — hata / kayıp
  WARNING:   0xFEE75C, // Sarı — uyarı
  MUTED:     0x4F545C, // Koyu gri — iptal / pasif

  // Oyun
  HUNT:      0x2C3E50, // Lacivert — hunt
  RARE:      0xF1C40F, // Altın — nadir
  PVP_WIN:   0xE74C3C, // Kırmızı — PvP kazanma
  PVP_LOSE:  0x95A5A6, // Gri — PvP kaybetme
  UPGRADE:   0x5865F2, // Blurple — upgrade
  INVENTORY: 0x5865F2, // Blurple — envanter
  STATS:     0x5865F2, // Blurple — stats
  BUFF:      0x9B59B6, // Mor — aktif buff
  TAME:      0x3498DB, // Mavi — tame
  MARKET:    0x27AE60, // Yeşil — market
  PRESTIGE:  0xF39C12, // Turuncu — prestige

  // Tier renkleri (encounter)
  TIER: [0, 0xE74C3C, 0xE67E22, 0xF1C40F, 0x2ECC71, 0x3498DB, 0x9B59B6, 0x95A5A6, 0x7F8C8D] as number[],
} as const;

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
 * Charge barı — ▰▱ karakterleri (OwO tarzı)
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
 * OwO tarzı başlık: ══ Title ══
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
  Legendary: 0xF1C40F,
  Epic:      0x9B59B6,
  Rare:      0x3498DB,
  Uncommon:  0x2ECC71,
  Common:    0x95A5A6,
};

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
