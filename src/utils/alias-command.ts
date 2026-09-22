/**
 * Eski bot komut alias'larını OwlHunt komutlarına çözümler.
 */
import insights from '../data/command-insights.json';
import type { CommandInsights } from '../data/command-insights-types';
import { expandMarketCommandText, isMarketGluedToken } from './market-alias';

const LEGACY_ALIASES: Record<string, string> = (insights as CommandInsights).legacyToOwlAliases;

/**
 * Türkçe diyakritik → ASCII (TR/EN klavye uyumu).
 * Ör: yardım→yardim, parçala→parcala, aç→ac, İ→i / I→i.
 */
export function foldTrAscii(input: string): string {
  return input
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

const GLUED_CMD =
  /^(h|b|s|c|z|k|bj|slot|cf|duelbet|db|daily|quest|cash|sell|hunt|battle|lb|inv|pray|wc|quests|duel|yardim|yardım|help|y|stats|st|stat|owls|owllist|ol|upgrade|up|tame|t|vs|prefix|market|pazar|trade|takas|buy|katalog|kat|kl|top|prestige|sk|ek|use|u|run|rune|rün|msell|sat|ms|dismantle|parçala|parca|parcala|ver|give|wc|ec|ac|aç|gems|gem|item|i|pf|q|money|leaderboard|liderboard|xp|wh|wb|wk|wbj|wcf|ws|wcash|wd|wq|wz|wi|wu|wsl|wslots|wp|ah|hb|sac|shop|ya|admin|ceza)(\s|$)/iu;

/**
 * Prefix metin komutunu çözümler.
 * - `null` = komut değil (bot yanıt vermez)
 * - `''` = prefix yazıldı ama alt komut yok
 */
export function resolvePrefixCommandText(content: string, guildPrefix: string): string | null {
  const trimmed = content.trimStart();
  const lowered = trimmed.toLowerCase();
  const defaultPrefix = 'owl ';
  const customPrefix = `${guildPrefix} `;

  if (lowered.startsWith(defaultPrefix)) {
    return expandMarketCommandText(trimmed.slice(defaultPrefix.length).trim());
  }
  if (lowered.startsWith(customPrefix)) {
    return expandMarketCommandText(trimmed.slice(customPrefix.length).trim());
  }

  const glued = stripGluedPrefix(trimmed, guildPrefix);
  if (glued !== trimmed) {
    return expandMarketCommandText(glued.trim());
  }
  return null;
}

/** Guild prefix ile yapışık komutları ayırır: wh → h, wdaily → daily */
export function stripGluedPrefix(content: string, guildPrefix: string): string {
  const trimmed = content.trim();
  if (!trimmed) return trimmed;
  const p = foldTrAscii(guildPrefix);
  if (p.length > 3) return trimmed;
  const lower = foldTrAscii(trimmed);
  if (!lower.startsWith(p) || lower.length <= p.length) return trimmed;
  const rest = trimmed.slice(guildPrefix.length).trim();
  if (rest.length === 1) {
    if (p === 'w' && rest.toLowerCase() === 's') return 'sell';
    return rest;
  }
  if (GLUED_CMD.test(rest) || GLUED_CMD.test(foldTrAscii(rest))) return rest;
  if (isMarketGluedToken(rest) || isMarketGluedToken(foldTrAscii(rest))) return rest;
  return trimmed;
}

/** Alias tablosundan hedef komuta çöz */
export function resolveLegacyAlias(raw: string): string | null {
  const key = foldTrAscii(raw.trim());
  if (!key) return null;
  return LEGACY_ALIASES[key] ?? LEGACY_ALIASES[raw.toLowerCase().trim()] ?? null;
}

/**
 * Prefix sonrası ilk token'ı alias tablosu ile normalize eder.
 * Ör: wh → hunt, wb → duel, wdaily → daily
 */
export function normalizeCommandToken(raw: string): string {
  const key = foldTrAscii(raw.trim());
  if (!key) return key;
  return resolveLegacyAlias(key) ?? key;
}

/** Bilinmeyen komut için kısayol eşleme ipucu */
export function buildAliasMigrationHint(prefix: string, rawInput: string): string | null {
  const target = resolveLegacyAlias(rawInput);
  if (!target) return null;
  return `🔄 **Komut eşlemesi:** \`${prefix} ${rawInput}\` → \`${prefix} ${target}\``;
}

export function getFlowHints(): CommandInsights['flowHints'] {
  return (insights as CommandInsights).flowHints;
}

export function formatFlowHint(template: string, prefix: string): string {
  return template.replace(/\{p\}/g, prefix);
}
