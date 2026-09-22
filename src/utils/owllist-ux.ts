/**
 * w owllist — okunaklı baykuş kartları (ID + özet + stat).
 */
import { OWLLIST_PAGE_SIZE } from '../config';
import { renderMoonEmoji, renderOwlMoonEmoji } from '../config/custom-emojis';
import {
  calcOwlStatSumPower,
  resolveOwlMoonTierFromStats,
  speciesShortName,
} from '../systems/owl-moon-evolution';
import { formatShortOwlId } from './owl-id';
import type { OwlCardInput } from './owls-ux';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export interface OwllistRenderData {
  owls: OwlCardInput[];
  helpPrefix: string;
  ownerDisplayName?: string | null;
}

function owlTitle(owl: OwlCardInput): string {
  const nick = owl.nickname?.trim();
  if (nick) return `**${nick}** · *${speciesShortName(owl.tier)}*`;
  return `*${owl.species}*`;
}

export function formatOwllistBlock(owl: OwlCardInput): string[] {
  const power = calcOwlStatSumPower(owl);
  const moonTier = resolveOwlMoonTierFromStats(owl);
  const owlEmoji = renderOwlMoonEmoji(owl.tier, moonTier);
  const moonEmoji = renderMoonEmoji(moonTier);
  const main = owl.isMain ? ' · **main**' : '';

  return [
    `${owlEmoji} ${owlTitle(owl)}${main}`,
    `\`${formatShortOwlId(owl.id)}\` · ${moonEmoji} · T${owl.tier} · HP ${owl.hp}/${owl.hpMax} · Güç ${power.toLocaleString('tr-TR')} · ${owl.quality}`,
    `-# Gaga ${owl.statGaga} · Göz ${owl.statGoz} · Kulak ${owl.statKulak} · Kanat ${owl.statKanat} · Pençe ${owl.statPence}`,
  ];
}

export function getOwllistPageCount(owlCount: number, pageSize = OWLLIST_PAGE_SIZE): number {
  if (owlCount === 0) return 1;
  return Math.max(1, Math.ceil(owlCount / pageSize));
}

export function parseOwllistPage(raw: string | undefined, totalPages: number): number {
  if (!raw?.trim()) return 1;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, totalPages);
}

function buildOwllistPageLines(data: OwllistRenderData, page: number): string[] {
  const { owls, helpPrefix } = data;
  if (owls.length === 0) {
    return [`${renderOwlMoonEmoji(1, 1)} Henüz hiç baykuşun yok.`];
  }

  const totalPages = getOwllistPageCount(owls.length);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * OWLLIST_PAGE_SIZE;
  const pageOwls = owls.slice(start, start + OWLLIST_PAGE_SIZE);

  const lines: string[] = totalPages > 1
    ? [`**Baykuşların (${owls.length})** · sayfa ${safePage}/${totalPages}`]
    : [`**Baykuşların (${owls.length})**`];

  for (let i = 0; i < pageOwls.length; i++) {
    if (i > 0) lines.push('');
    lines.push(...formatOwllistBlock(pageOwls[i]!));
  }

  lines.push(`-# Vitrin: \`${helpPrefix} owls\` · Main: \`${helpPrefix} setmain <id>\``);

  return lines;
}

export function buildOwllistPageRow(
  page: number,
  totalPages: number,
  disabled = false,
): ActionRowBuilder<ButtonBuilder> | null {
  if (totalPages <= 1) return null;
  const safePage = Math.min(Math.max(1, page), totalPages);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('owllist_prev')
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || safePage <= 1),
    new ButtonBuilder()
      .setCustomId('owllist_next')
      .setLabel('▶')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || safePage >= totalPages),
  );
}

export function buildOwllistPageText(data: OwllistRenderData, page = 1): string {
  return buildOwllistPageLines(data, page).join('\n');
}

/** @deprecated Tek sayfa döner; çoklu mesaj yerine sayfa argümanı kullanın. */
export function buildOwllistMessages(data: OwllistRenderData, page = 1): string[] {
  return [buildOwllistPageText(data, page)];
}

export function buildOwllistText(data: OwllistRenderData): string {
  return buildOwllistPageText(data, 1);
}
