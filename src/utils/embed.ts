import { EmbedBuilder } from 'discord.js';
import { COLORS } from './theme';

export interface QuickView {
  species: string;
  level: number;
  hp: number;
  hpMax: number;
  stamina?: string;
  power?: string;
  quality: string;
}

/**
 * Tum embed'lere hizli durum footer'i ekler.
 */
export function applyQuickView(embed: EmbedBuilder, quickView: QuickView): EmbedBuilder {
  const extras = [quickView.stamina ? `STA ${quickView.stamina}` : '', quickView.power ? `POW ${quickView.power}` : '']
    .filter(Boolean)
    .join(' | ');
  return embed.setFooter({
    text: `${quickView.species} Lv.${quickView.level} | HP ${quickView.hp}/${quickView.hpMax}${extras ? ` | ${extras}` : ''} | ${quickView.quality}`,
  });
}

/**
 * Discord embed alan sınırlarını doğrular (test / geliştirme).
 */
export function assertEmbedLimits(embed: EmbedBuilder): void {
  const data = embed.toJSON();
  let total =
    (data.title?.length ?? 0) +
    (data.description?.length ?? 0) +
    (data.footer?.text?.length ?? 0);

  for (const field of data.fields ?? []) {
    const nameLen = field.name?.length ?? 0;
    const valueLen = field.value?.length ?? 0;
    total += nameLen + valueLen;
    if (nameLen > 256) {
      throw new Error(`Embed field name too long (${nameLen}): ${field.name}`);
    }
    if (valueLen > 1024) {
      throw new Error(`Embed field value too long (${valueLen}): ${field.name}`);
    }
  }

  if (total > 6000) {
    throw new Error(`Embed total too long (${total})`);
  }
}

/**
 * Basarili islem embed'i uretir.
 */
export function successEmbed(title: string, description: string, quickView?: QuickView): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(COLORS.SUCCESS).setTitle(title).setDescription(description);
  return quickView ? applyQuickView(embed, quickView) : embed;
}

/**
 * Basarisiz islem embed'i uretir.
 */
export function failEmbed(title: string, description: string, quickView?: QuickView): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(COLORS.DANGER).setTitle(title).setDescription(description);
  return quickView ? applyQuickView(embed, quickView) : embed;
}

/**
 * Bilgilendirme embed'i uretir.
 */
export function infoEmbed(title: string, description: string, quickView?: QuickView): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(COLORS.PRIMARY).setTitle(title).setDescription(description);
  return quickView ? applyQuickView(embed, quickView) : embed;
}

/**
 * Uyari embed'i uretir.
 */
export function warningEmbed(title: string, description: string, quickView?: QuickView): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(COLORS.WARNING).setTitle(title).setDescription(description);
  return quickView ? applyQuickView(embed, quickView) : embed;
}
