/**
 * upgrade-ux.ts — Upgrade panel embed builder
 * Backend logic'e dokunmaz. Sadece UX.
 */

import { EmbedBuilder } from 'discord.js';
import type { OwlStatKey } from '../types';
import { statEffect } from './math';
import { UPGRADE_COST, UPGRADE_DEPENDENCIES } from '../config';
import type { AllStats } from './upgrade-deps';
import { checkUpgradeDep, getAllDepStatuses } from './upgrade-deps';

// ─── Renkler ─────────────────────────────────────────────────────────────────
const COLOR_PANEL   = 0x5865f2;
const COLOR_SUCCESS = 0x2ecc71;
const COLOR_FAIL    = 0xe74c3c;
const COLOR_CANCEL  = 0x95a5a6;
const COLOR_WARN    = 0xe67e22; // düşük şans

// ─── Stat meta ───────────────────────────────────────────────────────────────
const STAT_META: Record<OwlStatKey, {
  icon:  string;
  label: string;
  desc:  string;   // oyuncuya gösterilen kısa açıklama
  tip:   string;   // footer ipucu
}> = {
  gaga:  {
    icon:  '🦷',
    label: 'Gaga',
    desc:  'Saldırı gücünü ve av hasarını artırır.',
    tip:   'Gaga, PvP\'de ve zor avlarda fark yaratır.',
  },
  pence: {
    icon:  '🦅',
    label: 'Pence',
    desc:  'Yakalama gücünü ve hasar çıktısını artırır.',
    tip:   'Pence yüksekse kaçan avları daha kolay yakarsın.',
  },
  goz:   {
    icon:  '👁️',
    label: 'Göz',
    desc:  'Av bulma şansını ve nadir encounter oranını artırır.',
    tip:   'Göz, erken oyunda en hızlı ilerlemeyi sağlar.',
  },
  kulak: {
    icon:  '👂',
    label: 'Kulak',
    desc:  'Nadir avları tespit etme ve tame şansını artırır.',
    tip:   'Kulak, nadir baykuş bulmak için kritiktir.',
  },
  kanat: {
    icon:  '🪽',
    label: 'Kanat',
    desc:  'Stamina kapasitesini ve kaçan avı yakalama şansını artırır.',
    tip:   'Kanat düşükse uzun avlarda stamina tükenir.',
  },
};

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

/** 10 segmentli progress bar. */
function bar(value: number, max: number, length = 10): string {
  const ratio  = max > 0 ? Math.min(value / max, 1) : 0;
  const filled = Math.round(ratio * length);
  const empty  = length - filled;
  return `\`${'█'.repeat(filled)}${'░'.repeat(empty)}\``;
}

/** Şans barı — renk + bar + yüzde. */
function chanceBar(chance: number): string {
  const filled = Math.round(chance / 10);
  const empty  = 10 - filled;
  const dot    = chance >= 70 ? '🟢' : chance >= 40 ? '🟡' : '🔴';
  return `${dot} \`${'█'.repeat(filled)}${'░'.repeat(empty)}\` **${chance.toFixed(1)}%**`;
}

/**
 * Bir stat seviyesinin oyun üzerindeki etkisini kısa metin olarak döndürür.
 * Formüllere dokunmaz — sadece statEffect() sonucunu yorumlar.
 */
function effectDelta(stat: OwlStatKey, oldVal: number): string {
  const before = statEffect(oldVal);
  const after  = statEffect(oldVal + 1);
  const delta  = (after - before).toFixed(2);

  switch (stat) {
    case 'gaga':
    case 'pence':
      return `+${delta} saldırı etkisi`;
    case 'goz':
      return `+${delta} av bulma etkisi`;
    case 'kulak':
      return `+${delta} tespit etkisi`;
    case 'kanat':
      return `+${delta} hız etkisi  ·  +0.5 stamina`;
    default:
      return `+${delta}`;
  }
}

// ─── Panel embed ─────────────────────────────────────────────────────────────
export interface UpgradePanelData {
  owlName:     string;
  owlQuality:  string;
  playerLevel: number;
  stat:        OwlStatKey;
  statValue:   number;
  chance:      number;
  allStats:    Record<OwlStatKey, number>;
  /** Bağımlılık kontrolü sonucu (upgrade.ts'ten gelir) */
  depCheck?: {
    ok:        boolean;
    dependsOn: OwlStatKey | null;
    required:  number;
    current:   number;
    gap:       number;
    suggestion: OwlStatKey | null;
  };
}

export function buildUpgradePanel(data: UpgradePanelData): EmbedBuilder {
  const meta      = STAT_META[data.stat];
  const resources = (UPGRADE_COST[data.stat] ?? []).map((c) => `${c.itemName} ×${c.quantity}`);

  // Bağımlılık durumu
  const stats: AllStats = data.allStats as AllStats;
  const depCheck = data.depCheck ?? checkUpgradeDep(data.stat, data.statValue + 1, stats);
  const depBlocked = !depCheck.ok && depCheck.dependsOn !== null;

  const isLowChance = data.chance < 40;
  // Bağımlılık engeli varsa turuncu, düşük şans varsa sarı, normal mavi
  const color = depBlocked ? 0xe67e22 : isLowChance ? 0xf1c40f : COLOR_PANEL;

  // ── Hedef stat bloğu ───────────────────────────────────────────────────────
  const statBarVis = bar(Math.min(data.statValue, 100), 100, 10);
  const delta      = effectDelta(data.stat, data.statValue);

  const targetBlock =
    `${meta.icon} **${meta.label}** — *${meta.desc}*\n` +
    `${statBarVis} Lv.**${data.statValue}** → Lv.**${data.statValue + 1}**\n` +
    `✨ Kazanım: **${delta}**`;

  // ── Bağımlılık satırı ──────────────────────────────────────────────────────
  let depLine = '';
  if (depCheck.dependsOn) {
    const depMeta = STAT_META[depCheck.dependsOn];
    if (depCheck.ok) {
      depLine = `✅ Gereksinim: ${depMeta.icon} **${depMeta.label}** Lv.**${depCheck.required}** — karşılandı`;
    } else {
      depLine =
        `❌ Gereksinim: ${depMeta.icon} **${depMeta.label}** Lv.**${depCheck.required}** ` +
        `*(senin: Lv.${depCheck.current}, eksik: ${depCheck.gap})*`;
      if (data.depCheck?.suggestion) {
        const sugMeta = STAT_META[data.depCheck.suggestion];
        depLine += `\n💡 **Öneri:** Önce ${sugMeta.icon} **${sugMeta.label}** geliştir`;
      }
    }
  }

  // ── Diğer statlar (bağımlılık durumu ile) ─────────────────────────────────
  const ORDER: OwlStatKey[] = ['gaga', 'pence', 'goz', 'kulak', 'kanat'];
  const otherLines = ORDER
    .filter((s) => s !== data.stat)
    .map((s) => {
      const m       = STAT_META[s];
      const v       = data.allStats[s];
      const b       = bar(Math.min(v, 100), 100, 6);
      const depInfo = UPGRADE_DEPENDENCIES[s];
      let depTag = '';
      if (depInfo?.dependsOn) {
        const req = Math.floor((v + 1) * depInfo.ratio);
        const cur = data.allStats[depInfo.dependsOn];
        depTag = cur >= req ? ' ✅' : ` ⚠️`;
      }
      return `${m.icon} **${m.label}** ${b} Lv.**${v}**${depTag}`;
    })
    .join('\n');

  // ── Şans açıklaması ────────────────────────────────────────────────────────
  const chanceNote = isLowChance
    ? '\n⚠️ *Şans düşük — stat seviyesi yükseldikçe zorlaşır.*'
    : '';

  // ── Embed ──────────────────────────────────────────────────────────────────
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(
      depBlocked
        ? `🔒 Geliştirme Kilitli — ${meta.icon} ${meta.label}`
        : `⚡ Geliştirme Paneli — ${meta.icon} ${meta.label}`,
    )
    .setDescription(
      `> **${data.owlName}** · ${data.owlQuality} · Oyuncu Lv.**${data.playerLevel}**`,
    )
    .addFields(
      {
        name: '🎯 Hedef',
        value: targetBlock,
        inline: false,
      },
    );

  // Bağımlılık satırı varsa ekle
  if (depLine) {
    embed.addFields({ name: '🔗 Bağımlılık', value: depLine, inline: false });
  }

  embed.addFields(
    {
      name: '🎲 Başarı Şansı',
      value: depBlocked
        ? '🔒 *Bağımlılık karşılanmadan deneme yapılamaz.*'
        : chanceBar(data.chance) + chanceNote,
      inline: true,
    },
    {
      name: '🛠️ Gerekli Materyal',
      value: resources.length > 0
        ? resources.map((r) => `• ${r}`).join('\n')
        : '— Materyal gerekmez',
      inline: true,
    },
    {
      name: '📊 Diğer Statlar',
      value: otherLines,
      inline: false,
    },
  );

  const footerText = depBlocked
    ? `🔒 Önce bağımlı statı geliştir, sonra tekrar dene.`
    : `💡 İpucu: ${meta.tip}  ·  Devam et → upgrade başlar`;

  embed.setFooter({ text: footerText });

  return embed;
}

// ─── Sonuç embed ─────────────────────────────────────────────────────────────
export function buildUpgradeResult(opts: {
  stat:      OwlStatKey;
  success:   boolean;
  oldValue:  number;
  newValue:  number;
  chance:    number;
}): EmbedBuilder {
  const meta = STAT_META[opts.stat];

  if (opts.success) {
    const statBarVis = bar(Math.min(opts.newValue, 100), 100, 10);
    const delta      = effectDelta(opts.stat, opts.oldValue);
    return new EmbedBuilder()
      .setColor(COLOR_SUCCESS)
      .setTitle('✅ Geliştirme Başarılı!')
      .setDescription(
        `${meta.icon} **${meta.label}** yükseldi!\n\n` +
        `Lv.**${opts.oldValue}** → Lv.**${opts.newValue}**\n` +
        `${statBarVis}\n\n` +
        `✨ Kazanım: **${delta}**\n` +
        `> 🎯 Şans: **${opts.chance.toFixed(1)}%** · Başardın!`,
      );
  }

  const downgraded = opts.newValue < opts.oldValue;
  return new EmbedBuilder()
    .setColor(COLOR_FAIL)
    .setTitle(downgraded ? '💀 Geliştirme Başarısız — Gerileme!' : '❌ Geliştirme Başarısız')
    .setDescription(
      `${meta.icon} **${meta.label}** ${downgraded ? 'geriledi' : 'değişmedi'}.\n\n` +
      `Lv.**${opts.oldValue}** ${downgraded ? `→ Lv.**${opts.newValue}** ⬇️` : '(değişmedi)'}\n\n` +
      `> 🎲 Şans: **${opts.chance.toFixed(1)}%** · Bu sefer olmadı.\n` +
      (downgraded
        ? '> ⚠️ *Yüksek seviyeli statlarda başarısızlık gerilemeye yol açabilir.*'
        : ''),
    );
}

// ─── Bağımlılık Engeli Embed ─────────────────────────────────────────────────

/**
 * DEP_FAIL hata mesajını parse edip güzel bir embed döndürür.
 * Format: "DEP_FAIL:dependsOn:required:current:suggestion"
 */
export function buildDepBlockedEmbed(errorMessage: string): EmbedBuilder | null {
  if (!errorMessage.startsWith('DEP_FAIL:')) return null;

  const parts = errorMessage.split(':');
  const dependsOn  = parts[1] as OwlStatKey | undefined;
  const required   = parseInt(parts[2] ?? '0');
  const current    = parseInt(parts[3] ?? '0');
  const suggestion = parts[4] as OwlStatKey | undefined;

  if (!dependsOn) return null;

  const depMeta = STAT_META[dependsOn];
  const sugMeta = suggestion ? STAT_META[suggestion] : null;

  return new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle('🔒 Geliştirme Engellendi')
    .setDescription(
      `Bu statı yükseltmek için önce bağımlı statı geliştirmen gerekiyor.\n\n` +
      `${depMeta.icon} **${depMeta.label}** gereksinimi karşılanmıyor:\n` +
      `> Gerekli: Lv.**${required}** · Senin: Lv.**${current}** · Eksik: **${required - current}**\n\n` +
      (sugMeta
        ? `👉 **Öneri:** ${sugMeta.icon} **${sugMeta.label}** geliştir, sonra tekrar dene.`
        : `👉 Önce ${depMeta.icon} **${depMeta.label}** geliştir.`),
    )
    .setFooter({ text: 'Materyaller harcanmadı.' });
}

// ─── İptal embed ─────────────────────────────────────────────────────────────
export function buildUpgradeCancel(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR_CANCEL)
    .setTitle('🚫 İptal Edildi')
    .setDescription('> Geliştirme iptal edildi. Materyaller harcanmadı.');
}

// ─── Genel Bilgi Paneli (argümansız "upgrade" komutu) ────────────────────────

const STAT_ORDER: OwlStatKey[] = ['gaga', 'pence', 'goz', 'kulak', 'kanat'];

export function buildUpgradeOverview(helpPrefix: string): EmbedBuilder {
  // Her stat için tek satır: ikon + ad + açıklama + materyal + bağımlılık
  const statBlocks = STAT_ORDER.map((s) => {
    const m     = STAT_META[s];
    const costs = UPGRADE_COST[s] ?? [];
    const mat   = costs.map((c) => `${c.itemName} ×${c.quantity}`).join(', ');
    const dep   = UPGRADE_DEPENDENCIES[s];
    const depText = dep?.dependsOn
      ? `🔗 *${STAT_META[dep.dependsOn].label} ≥ hedef×${dep.ratio}*`
      : '🔓 *Bağımsız (başlangıç statı)*';
    return (
      `${m.icon} **${m.label}** — *${m.desc}*\n` +
      `\`${helpPrefix} upgrade ${s}\`  ·  🛠️ ${mat}\n` +
      `${depText}`
    );
  }).join('\n\n');

  // Bağımlılık zinciri özeti
  const chainText =
    '```\n' +
    'pence (bağımsız)\n' +
    '  ├─ gaga  (pence × 0.5)\n' +
    '  └─ kulak (pence × 0.4)\n' +
    '       └─ goz   (kulak × 0.45)\n' +
    '            └─ kanat (goz × 0.5)\n' +
    '```';

  // Drop kaynakları özeti
  const dropNote =
    '• ***Kemik Tozu / Parlak Tüy*** — Zorluk 1–2 avlardan\n' +
    '• ***Kırık Av Zinciri*** — Zorluk 3+\n' +
    '• ***Av Gözü Kristali*** — Zorluk 4+\n' +
    '• ***Yırtıcı Pençe Parçası*** — Zorluk 5+ (nadir)';

  return new EmbedBuilder()
    .setColor(COLOR_PANEL)
    .setTitle('⚡ Geliştirme Sistemi')
    .setDescription(
      '> Baykuşunun statlarını geliştirerek daha güçlü avlar yap ve nadir baykuşlar bul.\n' +
      `> Kullanım: \`${helpPrefix} upgrade <stat>\``,
    )
    .addFields(
      {
        name: '📋 Statlar & Komutlar',
        value: statBlocks,
        inline: false,
      },
      {
        name: '🔗 Bağımlılık Zinciri',
        value: chainText,
        inline: false,
      },
      {
        name: '🎒 Materyal Nereden Düşer?',
        value: dropNote,
        inline: false,
      },
    )
    .setFooter({
      text: '💡 Pence temel stattır — önce onu geliştir. Bağımlılık Lv.5\'ten itibaren aktif olur.',
    });
}
