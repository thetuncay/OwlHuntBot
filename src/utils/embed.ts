import { EmbedBuilder } from 'discord.js';
import { COLOR_FAIL, COLOR_INFO, COLOR_SUCCESS, COLOR_WARNING } from '../config';

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
 * Basarili islem embed'i uretir.
 */
export function successEmbed(title: string, description: string, quickView?: QuickView): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(COLOR_SUCCESS).setTitle(title).setDescription(description);
  return quickView ? applyQuickView(embed, quickView) : embed;
}

/**
 * Basarisiz islem embed'i uretir.
 */
export function failEmbed(title: string, description: string, quickView?: QuickView): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(COLOR_FAIL).setTitle(title).setDescription(description);
  return quickView ? applyQuickView(embed, quickView) : embed;
}

/**
 * Bilgilendirme embed'i uretir.
 */
export function infoEmbed(title: string, description: string, quickView?: QuickView): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(COLOR_INFO).setTitle(title).setDescription(description);
  return quickView ? applyQuickView(embed, quickView) : embed;
}

/**
 * Uyari embed'i uretir.
 */
export function warningEmbed(title: string, description: string, quickView?: QuickView): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(COLOR_WARNING).setTitle(title).setDescription(description);
  return quickView ? applyQuickView(embed, quickView) : embed;
}
