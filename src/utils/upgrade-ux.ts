/**
 * upgrade-ux.ts — Upgrade panel embed builder
 * Backend logic'e dokunmaz. Sadece UX.
 */

import { EmbedBuilder } from 'discord.js';
import { formatCoinLabel } from '../config/ui-emojis';
import type { OwlStatKey } from '../types';
import { UPGRADE_SPREAD_MAX } from '../config';
import type { AllStats } from './upgrade-deps';
import type { BulkUpgradePlan } from './upgrade-bulk';
import { COLORS } from './theme';
import { formatStatRole, STAT_ROLE } from './stat-role-ux';

// ─── Stat meta ───────────────────────────────────────────────────────────────
const STAT_META: Record<OwlStatKey, { icon: string; label: string }> = {
  gaga:  { icon: '🦷', label: 'Gaga' },
  pence: { icon: '🦅', label: 'Pençe' },
  goz:   { icon: '👁️', label: 'Göz' },
  kulak: { icon: '👂', label: 'Kulak' },
  kanat: { icon: '🪽', label: 'Kanat' },
};

const STAT_ORDER: OwlStatKey[] = ['gaga', 'pence', 'goz', 'kulak', 'kanat'];

/** stats / upgrade arasında tutarlı ilerleme metni. */
export function formatUpgradeProgress(
  stat: OwlStatKey,
  effective: number,
  trained: number,
  nextEffective = effective + 1,
  nextTrained = trained + 1,
): string {
  const meta = STAT_META[stat];
  return (
    `${meta.icon} **${meta.label}** toplam **${effective}** → **${nextEffective}**\n` +
    `📈 Eğitim **${trained}** → **${nextTrained}** *(doğuş stat sabit)*`
  );
}

function formatCoinCostLine(coinCost: number, coinDiscountPct: number): string {
  if (coinDiscountPct > 0) {
    return `Maliyet: ${formatCoinLabel(coinCost)} (-%${coinDiscountPct} buff)`;
  }
  return `Maliyet: ${formatCoinLabel(coinCost)}`;
}

// ─── Panel embed ─────────────────────────────────────────────────────────────
export interface UpgradePanelData {
  owlName:     string;
  owlQuality:  string;
  stat:        OwlStatKey;
  /** Eğitim seviyesi (trained). */
  statTrained: number;
  /** Toplam stat (base + trained) — stats komutu ile aynı. */
  statEffective: number;
  coinCost:        number;
  coinDiscountPct: number;
  materialCost:    number;
  materialName:    string;
  /** Bağımlılık kontrolü için effective stat seti. */
  allStatsEffective: AllStats;
  /**
   * Toplu yükseltme planı (`all` / `up gaga 10`).
   * Yoksa veya 1 adım: tek seviye önizleme.
   */
  bulkPlan?: BulkUpgradePlan;
  depCheck?: {
    ok:        boolean;
    reason?:   'dependency' | 'spread';
    dependsOn: OwlStatKey | null;
    required:  number;
    current:   number;
    gap:       number;
    suggestion: OwlStatKey | null;
  };
}

export function buildUpgradePanel(data: UpgradePanelData, helpPrefix = 'w'): EmbedBuilder {
  const meta = STAT_META[data.stat];

  const depCheck = data.depCheck;
  const depBlocked = depCheck != null && !depCheck.ok && depCheck.dependsOn !== null;
  const color = depBlocked ? COLORS.WARNING : COLORS.UPGRADE;

  let lines: string[];

  if (depBlocked && depCheck?.dependsOn) {
    const needMeta = STAT_META[depCheck.dependsOn];
    const suggestStat = depCheck.suggestion ?? depCheck.dependsOn;

    if (depCheck.reason === 'spread') {
      lines = [
        `${meta.icon} **${meta.label}** şu an yükseltilemez.`,
        '',
        `${needMeta.icon} **${needMeta.label}** en az **${depCheck.required}** eğitim olmalı *(şu an: ${depCheck.current})*`,
        `📏 Statlar arası max **${UPGRADE_SPREAD_MAX}** fark.`,
        '',
        `🟢↗ Önce \`${helpPrefix} upgrade ${suggestStat}\``,
      ];
    } else {
      lines = [
        `${meta.icon} **${meta.label}** şu an yükseltilemez.`,
        '',
        `Önce ${needMeta.icon} **${needMeta.label}** toplam **${depCheck.required}** olmalı *(şu an: ${depCheck.current})*`,
        '',
        `🟢↗ Önce \`${helpPrefix} upgrade ${suggestStat}\``,
      ];
    }
  } else {
    const bulk = data.bulkPlan;
    const steps = bulk && bulk.affordableSteps > 1 ? bulk.affordableSteps : 1;
    if (steps > 1 && bulk) {
      lines = [
        formatUpgradeProgress(
          data.stat,
          bulk.startEffective,
          bulk.startTrained,
          bulk.endEffective,
          bulk.endTrained,
        ),
        formatCoinCostLine(bulk.totalCoin, data.coinDiscountPct) +
          ` + **${data.materialName} ×${bulk.totalMaterial}**`,
        `✅ Garanti **+${steps} eğitim**`,
      ];
    } else if (bulk && bulk.affordableSteps === 0) {
      const why =
        bulk.stopReason === 'coins' ? 'Yetersiz coin' :
        bulk.stopReason === 'material' ? `Yetersiz **${data.materialName}**` :
        bulk.stopReason === 'gate' ? 'Kilit / bağımlılık' :
        'Yükseltme yapılamıyor';
      lines = [
        formatUpgradeProgress(data.stat, data.statEffective, data.statTrained),
        `⚠️ ${why}`,
        formatCoinCostLine(data.coinCost, data.coinDiscountPct) +
          ` + **${data.materialName} ×${data.materialCost}**`,
      ];
    } else {
      lines = [
        formatUpgradeProgress(data.stat, data.statEffective, data.statTrained),
        formatCoinCostLine(data.coinCost, data.coinDiscountPct) +
          ` + **${data.materialName} ×${data.materialCost}**`,
        '✅ Garanti **+1 eğitim**',
      ];
    }
  }

  const blockReason = depCheck?.reason === 'spread' ? 'Fark kilidi' : 'Bağımlılık gerekli';
  const openFooter = `${STAT_ROLE[data.stat]} · Devam et → onayla`;
  const body = depBlocked
    ? `**${data.owlName}** · ${data.owlQuality}\n\n${lines.join('\n')}`
    : `**${data.owlName}** · ${data.owlQuality}\n\n${lines.join('\n')}\n\n${formatStatRole(data.stat)}`;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(depBlocked ? `🔒 ${meta.label}` : `⚡ ${meta.label}`)
    .setDescription(body)
    .setFooter({ text: depBlocked ? blockReason : openFooter });
}

// ─── Sonuç embed ─────────────────────────────────────────────────────────────
export function buildUpgradeResult(opts: {
  stat:           OwlStatKey;
  oldTrained:     number;
  newTrained:     number;
  effectiveOld:   number;
  effectiveNew:   number;
  /** Toplu yükseltmede kaç adım uygulandı (sadece hesap; UI'da meta satır yok). */
  steps?:         number;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle('✅ Başarılı')
    .setDescription(formatUpgradeProgress(
      opts.stat,
      opts.effectiveOld,
      opts.oldTrained,
      opts.effectiveNew,
      opts.newTrained,
    ));
}

// ─── Bağımlılık Engeli Embed ─────────────────────────────────────────────────

export function buildDepBlockedEmbed(errorMessage: string): EmbedBuilder | null {
  return buildUpgradeBlockedEmbed(errorMessage);
}

export function buildUpgradeBlockedEmbed(errorMessage: string, helpPrefix = 'w'): EmbedBuilder | null {
  if (errorMessage.startsWith('SPREAD_FAIL:')) {
    const parts = errorMessage.split(':');
    const weakest    = parts[1] as OwlStatKey | undefined;
    const required   = parseInt(parts[2] ?? '0');
    const current    = parseInt(parts[3] ?? '0');
    const suggestion = (parts[4] as OwlStatKey | undefined) ?? weakest;

    if (!weakest || !suggestion) return null;

    const weakMeta = STAT_META[weakest];
    const sugKey = suggestion;

    return new EmbedBuilder()
      .setColor(COLORS.WARNING)
      .setTitle('🔒 Fark kilidi')
      .setDescription(
        `${weakMeta.icon} **${weakMeta.label}** en az **${required}** eğitim olmalı *(şu an: ${current})*\n` +
        `📏 Statlar arası max **${UPGRADE_SPREAD_MAX}** fark.\n\n` +
        `🟢↗ Önce \`${helpPrefix} upgrade ${sugKey}\``,
      )
      .setFooter({ text: 'Materyal harcanmadı.' });
  }

  if (!errorMessage.startsWith('DEP_FAIL:')) return null;

  const parts = errorMessage.split(':');
  const dependsOn  = parts[1] as OwlStatKey | undefined;
  const required   = parseInt(parts[2] ?? '0');
  const current    = parseInt(parts[3] ?? '0');
  const suggestion = (parts[4] as OwlStatKey | undefined) ?? dependsOn;

  if (!dependsOn || !suggestion) return null;

  const depMeta = STAT_META[dependsOn];
  const sugKey = suggestion;

  return new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle('🔒 Önce başka stat gerekli')
    .setDescription(
      `${depMeta.icon} **${depMeta.label}** toplam **${required}** olmalı *(şu an: ${current})*\n\n` +
      `🟢↗ Önce \`${helpPrefix} upgrade ${sugKey}\``,
    )
    .setFooter({ text: 'Materyal harcanmadı.' });
}

export function buildUpgradeCancel(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.MUTED)
    .setTitle('🚫 İptal')
    .setDescription('Geliştirme iptal edildi.');
}

// ─── Genel Bilgi (argümansız upgrade / up) ───────────────────────────────────

export interface UpgradeOverviewStatSlice {
  effective: number;
  trained:   number;
}

export type UpgradeOverviewOwlStats = Record<OwlStatKey, UpgradeOverviewStatSlice>;

export function buildUpgradeOverview(helpPrefix: string, owlStats?: UpgradeOverviewOwlStats): EmbedBuilder {
  const statLines = STAT_ORDER.map((s) => {
    const m = STAT_META[s];
    const slice = owlStats?.[s];
    const lv = slice
      ? ` toplam **${slice.effective}** · eğitim **${slice.trained}**`
      : '';
    return `${m.icon} **${m.label}** ${formatStatRole(s)}${lv}\n\`${helpPrefix} upgrade ${s}\``;
  }).join('\n');

  return new EmbedBuilder()
    .setColor(COLORS.UPGRADE)
    .setTitle('⚡ Upgrade')
    .setDescription(
      `Geliştirmek istediğin statı seç *(stats ile aynı toplam değer)*:\n\n${statLines}\n\n` +
      `> Örn: \`${helpPrefix} up gaga 10\` · \`${helpPrefix} up kanat all\``,
    )
    .setFooter({ text: `Fark kilidi ${UPGRADE_SPREAD_MAX} (görünen stat) · Pençe→yakala · Göz→keşif` });
}
