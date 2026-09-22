/**
 * owl-moon-ux.ts — Ay evrimi bildirimi (Seçenek A · düz metin + etiket)
 */

import type { MoonEvolutionResult } from '../systems/owl-moon-evolution';
import { getMoonTierDef } from '../config/owl-moon-tier';
import { renderMoonEmoji, renderOwlMoonEmoji } from '../config/custom-emojis';

function buildUnlockLine(newTier: number): string | null {
  const newDef = getMoonTierDef(newTier);
  if (!newDef) return null;
  const parts: string[] = [];
  if (newDef.title) parts.push(`**${newDef.title}**`);
  if (newDef.aura) parts.push(`**${newDef.aura}**`);
  if (parts.length === 0) return null;
  return `🔓 ${parts.join(' · ')}`;
}

export function buildMoonEvolutionMessage(
  result: MoonEvolutionResult,
  helpPrefix = 'w',
): string {
  const newDef = getMoonTierDef(result.newMoonTier);
  const oldMoon = renderMoonEmoji(result.oldMoonTier);
  const newMoon = renderMoonEmoji(result.newMoonTier);
  const oldOwl = renderOwlMoonEmoji(result.speciesTier, result.oldMoonTier);
  const newOwl = renderOwlMoonEmoji(result.speciesTier, result.newMoonTier);
  const tierLabel = newDef?.label ?? `Moon ${result.newMoonTier}`;

  const lines = [
    '✦✦✦  AY EVRİMİ  ✦✦✦',
    '',
    `${oldMoon} ${oldOwl}  →  ${newMoon} ${newOwl}`,
    '',
    `**${result.displayName}** artık **${tierLabel}**`,
  ];

  const unlockLine = buildUnlockLine(result.newMoonTier);
  if (unlockLine) {
    lines.push('', unlockLine);
  }

  if (newDef?.flavor?.trim()) {
    lines.push('', newDef.flavor.trim());
  }

  lines.push('', `\`${helpPrefix} owls\` · vitrin güncellendi`);

  return lines.join('\n');
}

export function buildMoonEvolutionFollowUp(
  result: MoonEvolutionResult,
  helpPrefix = 'w',
): {
  content: string;
  allowedMentions: { users: string[] };
} {
  return {
    content: `<@${result.ownerId}>\n\n${buildMoonEvolutionMessage(result, helpPrefix)}`,
    allowedMentions: { users: [result.ownerId] },
  };
}
