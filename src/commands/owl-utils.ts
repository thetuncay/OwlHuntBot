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
import { buildAliasMigrationHint, foldTrAscii, normalizeCommandToken } from '../utils/alias-command';

// ─── Sabitler ─────────────────────────────────────────────────────────────────

export const TEXT_SUBCOMMANDS = [
  'yardim', 'hunt', 'stats', 'inventory', 'inv', 'setmain',
  'upgrade', 'up', 'vs', 'sell', 'zoo', 'prefix', 'cash', 'xp',
  'tame', 'owls', 'owllist', 'evrim', 'ver', 'give', 'duel',
  'slot', 'bj', 'duelbet', 'cf', 'kumar',
  'aç', 'ac', 'sk', 'ek', 'wc', 'ec',
  'use', 'u',
  'katalog', 'kat', 'kl', 'k', 'wk',
  'run', 'rune', 'rün',
  'dismantle', 'parçala', 'parcala', 'parca', 'market', 'pazar', 'trade', 'takas', 'buy', 'msell', 'sat', 'ms', 'quest', 'quests', 'daily', 'telafi',
  'kudos', 'tesekkur', 'teşekkür', 'mentor',
  'kiss', 'hug', 'love', 'punch', 'punc', 'slap', 'pat', 'cuddle', 'wave', 'highfive', 'hf', 'poke',
  'admin', 'ceza', 'owlonly',
  'owl',
  // Kısa alias uyumlu
  'battle', 'money', 'pray', 'top', 'lb',
  // kısaltmalar
  'h', 'b', 's', 'st', 'stat', 'sm', 'z', 'd', 'c', 't', 'g',
  'p', 'sl', 'ow', 'y', 'pf', 'q', 'k',
] as const;

export const ALIASES: Record<string, string> = {
  // Mevcut
  inv:  'inventory',
  up:   'upgrade',
  h:    'hunt',
  sm:   'setmain',
  z:    'zoo',
  d:    'duel',
  c:    'cash',
  xp:   'xp',
  t:    'tame',
  g:    'ver',
  give: 'ver',
  ac:   'aç',
  wc:   'sk',   // weapon crate → sk
  ec:   'ek',   // equipment crate → ek
  u:    'use',
  k:    'katalog',
  kat:  'katalog',
  kl:   'katalog',
  wk:   'katalog',
  bs:   'katalog',
  gems: 'katalog',
  buffs:'katalog',
  buff: 'katalog',
  gem:  'katalog',
  item: 'katalog',
  i:    'katalog',
  // rün → foldTrAscii → run; rune/rün alias
  rune: 'run',
  rün:  'run',
  parçala: 'dismantle',
  parca: 'dismantle',
  parcala: 'dismantle',
  m: 'market',
  shop: 'market',
  takas: 'trade',
  ms: 'msell',
  ascension: 'prestige',
  q: 'quest',
  gamble: 'kumar',
  kumarim: 'kumar',
  görevler: 'quest',
  gorevler: 'quest',
  quests: 'quest',
  tesekkur: 'kudos',
  'teşekkür': 'kudos',
  ceza: 'admin',
  punc: 'punch',
  hf: 'highfive',
  p:    'vs',
  sl:   'sell',
  ws:   'sell',
  ow:   'owls',
  ol:   'owllist',
  y:    'yardim',
  yardım: 'yardim',
  pf:   'prefix',
  // Kısa alias (veri: h→b→s, daily, cf)
  cf: 'cf',
  wcf: 'cf',
  s:    'slot',
  st:   'stats',
  stat: 'stats',
  b:    'duel',      // battle alias — use için u/buff
  battle: 'duel',
  money: 'cash',
  top: 'lb',
  liderboard: 'lb',
  leaderboard: 'lb',
  pray: 'katalog',
  // Yapışık prefix alias (metalab QC: wbj, wcash)
  wbj: 'bj',
  db: 'duelbet',
  wslots: 'slot',
  wsl: 'slot',
  wcash: 'cash',
  wdaily: 'daily',
  wd: 'quest',
  wq: 'quest',
  wz: 'zoo',
  wi: 'inventory',
  wu: 'use',
  wp: 'katalog',
  winv: 'inventory',
};

/** Prefix ilk token → handler anahtari (h → hunt, d → duel). TR/EN klavye fold dahil. */
export function resolveOwlSubcommand(rawSub: string): string {
  const folded = foldTrAscii(rawSub.trim());
  const normalized = normalizeCommandToken(folded);
  return ALIASES[normalized] ?? ALIASES[folded] ?? normalized;
}

export const UPGRADE_STATS: OwlStatKey[] = ['gaga', 'goz', 'kulak', 'kanat', 'pence'];

// Upgrade cooldown süreleri (sonuca göre)
import { UPGRADE_COOLDOWN_MS as UPGRADE_CMD_COOLDOWN_MS } from '../config';

export { UPGRADE_CMD_COOLDOWN_MS as UPGRADE_COOLDOWN_MS };

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
  const foldedInput = foldTrAscii(input);
  let best: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const option of options) {
    const score = Math.min(
      levenshtein(foldedInput, foldTrAscii(option)),
      levenshtein(input.toLowerCase(), option.toLowerCase()),
    );
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
      return {
        usage: `${prefix} yardim [kategori]`,
        description: 'Komut rehberi. Kategoriler: av, esya, pvp, ekonomi, market, kumar, ipucu.',
      };
    case 'hunt':
      return {
        usage: `${prefix} hunt`, aliases: `${prefix} h`,
        description: 'Baykuşunu avlanmaya gönderir (tek Av Bölgesi, biyom seçimi yok).',
        example: `${prefix} hunt`,
      };
    case 'stats':
      return {
        usage: `${prefix} stats [deep]`, aliases: `${prefix} st · ${prefix} stat`,
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
        usage: `${prefix} upgrade <stat> [adet|all]`, aliases: `${prefix} up <stat>`,
        description: 'Main baykuşunun seçilen statını geliştirir. Toplu: `up gaga 10` / `up kanat all`.',
        example: `${prefix} up gaga 10`,
      };
    case 'vs':
      return {
        usage: `${prefix} vs <@oyuncu|oyuncuId>`,
        description: 'Bir oyuncuya PvP meydan okuması gönderir. 35 saniye içinde kabul etmezse düşer.',
        example: `${prefix} vs @Ahmet`,
      };
    case 'tame':
      return {
        usage: `${prefix} hunt → Evcilleştir`,
        aliases: `${prefix} t`,
        description: 'Yabani baykuş evcilleştirme hunt sonrası butonla yapılır; ID yazılmaz.',
        example: `${prefix} hunt`,
      };
    case 'sell':
      return {
        usage: `${prefix} sell all|<hayvan>`, aliases: `${prefix} sl`,
        description: 'Belirtilen avı veya tüm avları satar. Argümansız kullanımda yardım gösterir.',
        example: `${prefix} sell all`,
      };
    case 'zoo':
      return {
        usage: `${prefix} zoo`, aliases: `${prefix} z`,
        description: 'Av koleksiyonunu OwO tarzı grid listesi olarak gösterir (satınca keşfedilen türler kaybolmaz).',
        example: `${prefix} zoo`,
      };
    case 'duel':
      return {
        usage: `${prefix} duel`, aliases: `${prefix} d · ${prefix} b · ${prefix} battle`,
        description: 'Bot ile duel — kazanınca coin + XP, üst üste kazançta streak bonusu.',
        example: `${prefix} duel`,
      };
    case 'cash':
      return {
        usage: `${prefix} cash`, aliases: `${prefix} c`,
        description: 'Mevcut coin bakiyeni ve seviyeni gösterir.',
        example: `${prefix} cash`,
      };
    case 'xp':
      return {
        usage: `${prefix} xp`,
        description: 'Seviye ilerleme çubuğu ve sonraki level için kalan XP.',
        example: `${prefix} xp`,
      };
    case 'prefix':
      return {
        usage: `${prefix} prefix <deger>`,
        description: 'Bu sunucu için metin komut prefixini değiştirir. Yönetici yetkisi gerekir.',
        example: `${prefix} prefix baykus`,
      };
    case 'quest':
    case 'quests':
      return {
        usage: `${prefix} quest [claim]`,
        aliases: `${prefix} q · ${prefix} quests`,
        description: 'Günlük görevleri görüntüle ve ödül al.',
        example: `${prefix} quest`,
      };
    case 'daily':
      return {
        usage: `${prefix} daily`,
        aliases: `${prefix} wdaily`,
        description: 'Günlük giriş ödülünü al (seri bonusu, coin, XP, kutular).',
        example: `${prefix} daily`,
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
  const aliasHint = buildAliasMigrationHint(prefix, rawInput);

  if (suggestion) {
    const info = commandInfo(prefix, suggestion);
    const lines: string[] = [`\`${info.usage}\``];
    if (info.aliases) lines.push(`Kısayol: \`${info.aliases}\``);
    lines.push(`\n${info.description}`);
    if (info.example) lines.push(`\n**Örnek:** \`${info.example}\``);

    const fields = [
      { name: `💡 ${suggestion}`, value: lines.join('\n'), inline: false },
      { name: '📚 Tüm Komutlar', value: `\`${prefix} yardim\` yazarak tam listeye ulaşabilirsin.`, inline: false },
    ];
    if (aliasHint) {
      fields.unshift({ name: '🔄 Komut eşlemesi', value: aliasHint, inline: false });
    }

    embed
      .setTitle('❓ Komut Bulunamadı')
      .setDescription(`\`${prefix} ${rawInput}\` tanımlı değil.\n\nBunu mu demek istedin?`)
      .addFields(fields)
      .setFooter({ text: `Komutlar: ${prefix} <komut>` });
  } else {
    const fields = [
      {
        name: '📚 Tüm Komutlar',
        value: `\`${prefix} yardim\` yazarak komut listesine ulaşabilirsin.`,
        inline: false,
      },
    ];
    if (aliasHint) {
      fields.unshift({ name: '🔄 Komut eşlemesi', value: aliasHint, inline: false });
    }

    embed
      .setTitle('❓ Komut Bulunamadı')
      .setDescription(`\`${prefix} ${rawInput}\` tanımlı bir komut değil.`)
      .addFields(fields)
      .setFooter({ text: 'Kısayol: h sl up = hunt · sell · upgrade' });
  }

  return embed;
}
