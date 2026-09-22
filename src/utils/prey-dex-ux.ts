/**
 * prey-dex-ux.ts — Av defteri koleksiyon ekranı (B5 · K1).
 *
 * İki spec tek ekranda buluşuyor:
 *   - B5: "bulduğun/toplam" + eksik avlara yönlendiren ilerleme çubuğu.
 *   - K1: keşfedilmemiş tür `????` olarak görünür + kısmi, **çözülebilir** ipucu.
 *
 * Loewenstein'ın information-gap fikri: oyuncu neyi bilmediğini bilirse merak
 * eder. Bu yüzden eksik türler tamamen saklanmaz, "bir şey var ama ne?" olarak
 * gösterilir.
 */

import { EmbedBuilder } from 'discord.js';
import { PREY } from '../config';
import { renderPreyEmoji } from '../config/custom-emojis';
import { preyDiscoveryHint, preyLore } from '../config/prey-lore';
import type { PreyDexRow } from '../systems/prey-dex';
import { COLORS, hpBar } from './theme';

/** Ekranda gösterilen maksimum ipucu satırı — liste duvarı olmasın. */
const MAX_HINT_ROWS = 4;

const UNKNOWN_LABEL = '????';

function difficultyOf(preyName: string): number {
  return PREY.find((p) => p.name === preyName)?.difficulty ?? 0;
}

export interface PreyDexProgress {
  discovered: number;
  total: number;
  percent: number;
  /** Henüz keşfedilmemiş türler, kolaydan zora sıralı. */
  missing: PreyDexRow[];
}

/**
 * Koleksiyon ilerlemesini hesaplar.
 *
 * @param rows Prey-dex satırları
 */
export function computePreyDexProgress(rows: PreyDexRow[]): PreyDexProgress {
  const discovered = rows.filter((r) => r.discovered).length;
  const total = rows.length;
  const missing = rows
    .filter((r) => !r.discovered)
    .sort((a, b) => difficultyOf(a.preyName) - difficultyOf(b.preyName));

  return {
    discovered,
    total,
    percent: total > 0 ? (discovered / total) * 100 : 0,
    missing,
  };
}

/**
 * İlerleme çubuğu satırı (B5).
 *
 * @param progress Koleksiyon ilerlemesi
 */
export function buildPreyDexProgressLine(progress: PreyDexProgress): string {
  const bar = hpBar(progress.discovered, progress.total, 12);
  return `\`${bar}\` **Keşfedilen ${progress.discovered}/${progress.total}** · ${progress.percent.toFixed(0)}%`;
}

/**
 * Eksik türler için `????` + ipucu satırları (K1).
 *
 * En kolay bulunabilecekler önce gelir — oyuncuya ulaşılabilir bir sonraki
 * hedef verir. Tamamlanmışsa kutlama satırı döner.
 *
 * @param progress Koleksiyon ilerlemesi
 */
export function buildPreyDexHintLines(progress: PreyDexProgress): string[] {
  if (progress.missing.length === 0) {
    return ['🏆 Defterin tamam — her türü kaydettin.'];
  }

  const shown = progress.missing.slice(0, MAX_HINT_ROWS).map((row) => {
    const hint = preyDiscoveryHint(difficultyOf(row.preyName));
    return `${UNKNOWN_LABEL} — ${hint}`;
  });

  const rest = progress.missing.length - shown.length;
  if (rest > 0) shown.push(`-# ve **${rest}** tür daha kayıtsız`);

  return shown;
}

/**
 * Keşfedilmiş türlerin lore'lu listesi — koleksiyonun ödülü bilginin kendisi.
 *
 * @param rows Prey-dex satırları
 * @param limit Gösterilecek maksimum satır
 */
export function buildDiscoveredLoreLines(rows: PreyDexRow[], limit = 5): string[] {
  return rows
    .filter((r) => r.discovered)
    .sort((a, b) => difficultyOf(b.preyName) - difficultyOf(a.preyName))
    .slice(0, limit)
    .map((row) => {
      const lore = preyLore(row.preyName);
      const emoji = renderPreyEmoji(row.preyName);
      return lore ? `${emoji} *${lore}*` : `${emoji} —`;
    });
}

/**
 * Av defteri koleksiyon embed'i.
 *
 * @param username Oyuncu adı
 * @param rows Prey-dex satırları
 * @param prefix Sunucu komut prefix'i
 */
export function buildPreyDexEmbed(
  username: string,
  rows: PreyDexRow[],
  prefix: string,
): EmbedBuilder {
  const progress = computePreyDexProgress(rows);
  const complete = progress.missing.length === 0;

  const embed = new EmbedBuilder()
    .setColor(complete ? COLORS.RARE : COLORS.JOURNAL)
    .setTitle(`📖 ${username} · Av Defteri`)
    .setDescription(buildPreyDexProgressLine(progress))
    .addFields({
      name: complete ? '🏆 Tamamlandı' : '❓ Kayıtsız türler',
      value: buildPreyDexHintLines(progress).join('\n'),
      inline: false,
    });

  const loreLines = buildDiscoveredLoreLines(rows);
  if (loreLines.length > 0) {
    embed.addFields({
      name: '🪶 Defterinden notlar',
      value: loreLines.join('\n'),
      inline: false,
    });
  }

  return embed.setFooter({ text: `Grid görünümü: ${prefix} zoo` });
}
