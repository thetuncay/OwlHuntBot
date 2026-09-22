/**
 * trade-modals.ts — Trade para / özel miktar modalları
 */

import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { buildCoinModalId, buildPickQtyModalId } from './trade-customid';

export function buildTradeCoinModal(params: {
  sessionId: string;
  available: number;
  currentOffer: number;
}): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(buildCoinModalId(params.sessionId))
    .setTitle('Trade para');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('amount')
        .setLabel(`Miktar (max ${params.available.toLocaleString('tr-TR')})`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(12)
        .setValue(String(params.currentOffer > 0 ? params.currentOffer : 0))
        .setPlaceholder('0 = para yok'),
    ),
  );

  return modal;
}

export function buildTradeCustomQtyModal(params: {
  sessionId: string;
  absIndex: number;
  itemName: string;
  maxQuantity: number;
}): ModalBuilder {
  const title = params.itemName.length > 40
    ? `${params.itemName.slice(0, 37)}…`
    : params.itemName;
  return new ModalBuilder()
    .setCustomId(buildPickQtyModalId(params.sessionId, params.absIndex))
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('quantity')
          .setLabel(`Adet (max ${params.maxQuantity})`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(8)
          .setPlaceholder(String(params.maxQuantity)),
      ),
    );
}

export function parsePositiveInt(raw: string): number | null {
  const cleaned = raw.replace(/[_\s.,]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
