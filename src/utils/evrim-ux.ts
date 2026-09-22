/**
 * evrim-ux.ts — Ay evrimi ilerleme ekranı (`w evrim`)
 */

import { getMoonTierDef, type MoonTierProgress } from '../config/owl-moon-tier';
import { renderMoonEmoji, renderOwlMoonEmoji } from '../config/custom-emojis';
import { hpBar } from './theme';

/** Son adım vurgusu — kalan güç bu eşiğin altındaysa (C2). */
const EVOLUTION_FINALE_REMAINING = 20;

export interface EvrimDisplayInput {
  displayName: string;
  speciesTier: number;
  progress: MoonTierProgress;
}

function buildNextUnlockLine(nextTier: number): string | null {
  const nextDef = getMoonTierDef(nextTier);
  if (!nextDef) return null;
  const parts: string[] = [];
  if (nextDef.title) parts.push(`**${nextDef.title}**`);
  if (nextDef.aura) parts.push(`**${nextDef.aura}**`);
  if (parts.length === 0) return null;
  return `🔓 ${parts.join(' · ')}`;
}

export function buildEvrimMessage(
  input: EvrimDisplayInput,
  helpPrefix = 'w',
): string {
  const { displayName, speciesTier, progress } = input;
  const moon = renderMoonEmoji(progress.currentTier);
  const owl = renderOwlMoonEmoji(speciesTier, progress.currentTier);
  const tierLabel = progress.currentDef.label;

  const lines = [
    '✦✦✦  AY EVRİMİ  ✦✦✦',
    '',
    `${moon} ${owl}  **${displayName}** · **${tierLabel}**`,
    '',
    `Güç **${progress.power}**`,
  ];

  if (progress.atMax || !progress.nextDef || progress.remaining == null || progress.nextThreshold == null) {
    lines.push('Maksimum ay kademesi');
  } else {
    const nextMoon = renderMoonEmoji(progress.nextTier!);
    const bar = hpBar(progress.power, progress.nextThreshold, 12);
    const finale = progress.remaining <= EVOLUTION_FINALE_REMAINING;
    lines.push(
      `\`${bar}\` **${progress.power}/${progress.nextThreshold}**`,
      finale
        ? `✦ Son adım: ${nextMoon} **${progress.nextDef.label}** · **${progress.remaining}** kaldı`
        : `Sonraki: ${nextMoon} **${progress.nextDef.label}** · **${progress.remaining}** kaldı`,
    );
    const unlockLine = buildNextUnlockLine(progress.nextTier!);
    if (unlockLine) {
      lines.push('', unlockLine);
    }
  }

  lines.push('', `\`${helpPrefix} upgrade\` ile stat yükselt`);

  return lines.join('\n');
}
