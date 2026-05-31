/**
 * OwO → OwlHunt komut normalizasyonu ve alias çözümleme
 */
import insights from '../data/owo-insights.json';
import type { OwOInsights } from '../data/owo-types';

const OWO_ALIASES: Record<string, string> = (insights as OwOInsights).owoToOwlAliases;

const OWO_GLUED_CMD =
  /^(h|b|s|c|z|cf|bj|slot|daily|cash|sell|hunt|battle|lb|inv|pray|wc|owo|quests|duel|yardim|yardım|help|y|stats|st|stat|owls|upgrade|up|tame|t|vs|prefix|craft|market|buy|buffs|soru|top|prestige|sk|ek|use|u|msell|dismantle|craftinfo|ver|give|wc|ec|ac|aç|buff|gems|gem|item|i|pf|q|money|leaderboard|liderboard)(\s|$)/iu;

/** Guild prefix ile yapışık OwO komutlarını ayırır: wh → h, wdaily → daily */
export function stripGluedPrefix(content: string, guildPrefix: string): string {
  const trimmed = content.trim();
  if (!trimmed) return trimmed;
  const p = guildPrefix.toLowerCase();
  if (p.length > 3) return trimmed;
  const lower = trimmed.toLowerCase();
  if (!lower.startsWith(p) || lower.length <= p.length) return trimmed;
  const rest = trimmed.slice(p.length).trim();
  if (rest.length === 1) return rest;
  if (OWO_GLUED_CMD.test(rest)) return rest;
  return trimmed;
}

/** OwO alias tablosundan hedef komuta çöz */
export function resolveOwOAlias(raw: string): string | null {
  const key = raw.toLowerCase();
  return OWO_ALIASES[key] ?? null;
}

/** Bilinmeyen komut için OwO ipucu metni */
export function buildOwOMigrationHint(prefix: string, rawInput: string): string | null {
  const owoTarget = resolveOwOAlias(rawInput);
  if (!owoTarget) return null;
  return `🔄 **OwO geçişi:** \`${prefix} ${rawInput}\` → \`${prefix} ${owoTarget}\``;
}

export function getOwOFlowHints(): OwOInsights['flowHints'] {
  return (insights as OwOInsights).flowHints;
}

export function formatFlowHint(template: string, prefix: string): string {
  return template.replace(/\{p\}/g, prefix);
}
