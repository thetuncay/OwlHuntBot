/**
 * owl-utils.ts — owl.ts için paylaşılan yardımcı fonksiyonlar
 *
 * İçerik:
 *   - levenshtein / findClosest  (typo düzeltme)
 *   - CommandInfo arayüzü + commandInfo()
 *   - buildUnknownCommandEmbed()
 *   - Sabit listeler: TEXT_SUBCOMMANDS, ALIASES, UPGRADE_STATS
 *   - Cooldown sabitleri
 */

import { EmbedBuilder } from 'discord.js';
import type { OwlStatKey } from '../types';

// ─── Sabitler ─────────────────────────────────────────────────────────────────

export const TEXT_SUBCOMMANDS = [
  'yardim', 'hunt', 'stats', 'inventory', 'inv', 'setmain',
  'upgrade', 'up', 'vs', 'sell', 'zoo', 'prefix', 'cash',
  'tame', 'owls', 'ver', 'give',
  'cf', 'slot', 'bj',
] as const;

export const ALIASES: Record<string, string> = {
  inv:  'inventory',
  up:   'upgrade',
  h:    'hunt',
  s:    'stats',
  sm:   'setmain',
  z:    'zoo',
  d:    'duel',
  c:    'cash',
  t:    'tame',
  g:    'ver',
  give: 'ver',
};

export const UPGRADE_STATS: OwlStatKey[] = ['gaga', 'goz', 'kulak', 'kanat', 'pence'];

// Upgrade cooldown süreleri (sonuca göre)
export const UPGRADE_COOLDOWN_SUCCESS_MS = 30 * 1000; // başarılı → 30s
export const UPGRADE_COOLDOWN_FAIL_MS    = 45 * 1000; // başarısız → 45s

// ─── Typo düzeltme ────────────────────────────────────────────────────────────

export function levenshtein(a: string, b: string): number {
  let prevRow: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const currRow: number[] = [i];
    const aChar = a.charAt(i - 1);
    for (let j = 1; j <= b.length; j += 1) {
      const bChar = b.charAt(j - 1);
      const cost = aChar === bChar ? 0 : 1;
      const del = (prevRow[j] ?? 0) + 1;
      const ins = (currRow[j - 1] ?? 0) + 1;
      const sub = (prevRow[j - 1] ?? 0) + cost;
      currRow[j] = Math.min(del, ins, sub);
    }
    prevRow = currRow;
  }
  return prevRow[b.length] ?? 0;
}

export function findClosest(input: string, options: readonly string[]): string | null {
  if (!input) return null;
  let best: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const option of options) {
    const score = levenshtein(input, option);
    if (score < bestScore) {
      bestScore = score;
      best = option;
    }
  }
  return bestScore <= 2 ? best : null;
}

// ─── Komut bilgisi ────────────────────────────────────────────────────────────

export interface CommandInfo {
  usage: string;
  aliases?: string;
  description: string;
  example?: string;
}

export function commandInfo(prefix: string, sub: string): CommandInfo {
  switch (sub) {
    case 'yardim':
      return { usage: `${prefix} yardim`, description: 'Tüm komutları ve oyun rehberini gösterir.' };
    case 'hunt':
      return {
        usage: `${prefix} hunt`, aliases: `${prefix} h`,
        description: 'Baykuşunu avlanmaya gönderir. Cooldown bittikten sonra tekrar kullanabilirsin.',
        example: `${prefix} hunt`,
      };
    case 'stats':
      return {
        usage: `${prefix} stats [deep]`, aliases: `${prefix} s`,
        description: 'Main baykuşunun istatistiklerini gösterir. `deep` yazarsan formül detayları da çıkar.',
        example: `${prefix} stats deep`,
      };
    case 'inventory':
      return {
        usage: `${prefix} inventory`, aliases: `${prefix} inv`,
        description: 'Envanterindeki tüm eşyaları listeler.',
        example: `${prefix} inv`,
      };
    case 'setmain':
      return {
        usage: `${prefix} setmain <baykusId>`, aliases: `${prefix} sm <baykusId>`,
        description: 'Envanterindeki başka bir baykuşu main olarak ayarlar.',
        example: `${prefix} setmain abc123`,
      };
    case 'upgrade':
      return {
        usage: `${prefix} upgrade <gaga|goz|kulak|kanat|pence>`, aliases: `${prefix} up <stat>`,
        description: 'Main baykuşunun seçilen statını geliştirmeye çalışır.',
        example: `${prefix} upgrade gaga`,
      };
    case 'vs':
      return {
        usage: `${prefix} vs <@oyuncu|oyuncuId>`,
        description: 'Bir oyuncuya PvP meydan okuması gönderir. 60 saniye içinde kabul etmezse düşer.',
        example: `${prefix} vs @Ahmet`,
      };
    case 'tame':
      return {
        usage: `${prefix} tame <encounterID>`, aliases: `${prefix} t <encounterID>`,
        description: 'Avlanma sırasında karşılaştığın yabani baykuşu evcilleştirmeye çalışır.',
        example: `${prefix} tame enc_abc123`,
      };
    case 'sell':
      return {
        usage: `${prefix} sell [all|<hayvan>]`,
        description: 'Avladığın hayvanları satar.',
        example: `${prefix} sell all`,
      };
    case 'zoo':
      return {
        usage: `${prefix} zoo`, aliases: `${prefix} z`,
        description: 'Envanterindeki tüm av hayvanlarını rarity\'ye göre gruplandırarak gösterir.',
        example: `${prefix} zoo`,
      };
    case 'duel':
      return {
        usage: `${prefix} duel`, aliases: `${prefix} d`,
        description: 'Bot ile simüle bir PvP duel yapar.',
        example: `${prefix} duel`,
      };
    case 'cash':
      return {
        usage: `${prefix} cash`, aliases: `${prefix} c`,
        description: 'Mevcut coin bakiyeni ve seviyeni gösterir.',
        example: `${prefix} cash`,
      };
    case 'prefix':
      return {
        usage: `${prefix} prefix <deger>`,
        description: 'Bu sunucu için metin komut prefixini değiştirir. Yönetici yetkisi gerekir.',
        example: `${prefix} prefix baykus`,
      };
    default:
      return { usage: `${prefix} yardim`, description: 'Tüm komutları listeler.' };
  }
}

// ─── Bilinmeyen komut embed'i ─────────────────────────────────────────────────

export function buildUnknownCommandEmbed(
  prefix: string,
  rawInput: string,
  suggestion: string | null,
): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(0xed4245);

  if (suggestion) {
    const info = commandInfo(prefix, suggestion);
    const lines: string[] = [`\`${info.usage}\``];
    if (info.aliases) lines.push(`Kısayol: \`${info.aliases}\``);
    lines.push(`\n${info.description}`);
    if (info.example) lines.push(`\n**Örnek:** \`${info.example}\``);

    embed
      .setTitle('❓ Komut Bulunamadı')
      .setDescription(`\`${prefix} ${rawInput}\` tanımlı değil.\n\nBunu mu demek istedin?`)
      .addFields(
        { name: `💡 ${suggestion}`, value: lines.join('\n'), inline: false },
        { name: '📚 Tüm Komutlar', value: `\`${prefix} yardim\` yazarak tam listeye ulaşabilirsin.`, inline: false },
      )
      .setFooter({ text: `Slash komutlar için /owl kullanabilirsin` });
  } else {
    embed
      .setTitle('❓ Komut Bulunamadı')
      .setDescription(`\`${prefix} ${rawInput}\` tanımlı bir komut değil.`)
      .addFields({
        name: '📚 Tüm Komutlar',
        value: `\`${prefix} yardim\` yazarak komut listesine ulaşabilirsin.\nSlash komutlar için \`/owl\` kullanabilirsin.`,
        inline: false,
      })
      .setFooter({ text: 'İpucu: Komut adını tam yazmaya çalış' });
  }

  return embed;
}
