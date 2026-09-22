/**
 * market-modals.ts — Pazar modal formları
 */

import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { MarketListing } from '@prisma/client';
import { buildScreenCustomId, stripMarketPrefix } from './market-customid';
import { MARKET_SELLER_NOTE_MAX } from './market-seller-note';

export function buildEditListingModal(listing: MarketListing): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(buildScreenCustomId(`modal:editlisting:${listing.listingNo}`))
    .setTitle('İlanı düzenle')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('price')
          .setLabel('Fiyat (coin)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(listing.price)),
      ),
    );

  if (listing.marketCategory !== 'owl') {
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('quantity')
          .setLabel('Adet')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(listing.quantity)),
      ),
    );
  }

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('note')
        .setLabel('Not')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(MARKET_SELLER_NOTE_MAX)
        .setPlaceholder('Opsiyonel — en fazla 120 karakter')
        .setValue(listing.sellerNote ?? ''),
    ),
  );

  return modal;
}

export function parseEditListingModalListingNo(customId: string): number | null {
  const raw = stripMarketPrefix(customId);
  if (!raw.startsWith('modal:editlisting:')) return null;
  const listingNo = parseInt(raw.split(':')[2] ?? '0', 10);
  return listingNo > 0 ? listingNo : null;
}

export function isEditListingModal(customId: string): boolean {
  return parseEditListingModalListingNo(customId) != null;
}

/** @deprecated use isEditListingModal */
export function isEditNoteModal(customId: string): boolean {
  return isEditListingModal(customId);
}

export function buildSellModal(
  type: 'item' | 'owl',
  itemId: string,
  opts?: { maxQuantity?: number; defaultQuantity?: number },
): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(buildScreenCustomId(`sell:modal:${type}:${itemId}`))
    .setTitle(type === 'item' ? 'Eşya satışı' : 'Baykuş satışı');

  const rows: ActionRowBuilder<TextInputBuilder>[] = [];

  if (type === 'item' && (opts?.maxQuantity ?? 1) > 1) {
    rows.push(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('quantity')
          .setLabel('Adet')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(opts?.defaultQuantity ?? 1)),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('price')
        .setLabel('Fiyat (coin)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('En az 1 coin'),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('note')
        .setLabel('Not')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(MARKET_SELLER_NOTE_MAX)
        .setPlaceholder('Opsiyonel'),
    ),
  );

  modal.addComponents(...rows);
  return modal;
}

export interface ParsedSellModalCustomId {
  type: 'item' | 'owl';
  itemId: string;
}

export function parseSellModalCustomId(customId: string): ParsedSellModalCustomId | null {
  const raw = stripMarketPrefix(customId);
  if (!raw.startsWith('sell:modal:')) return null;
  const parts = raw.split(':');
  const type = parts[2];
  const itemId = parts.slice(3).join(':');
  if ((type !== 'item' && type !== 'owl') || !itemId) return null;
  return { type, itemId };
}

export function isSellModal(customId: string): boolean {
  return parseSellModalCustomId(customId) != null;
}

export function buildSearchModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(buildScreenCustomId('modal:search'))
    .setTitle('Pazarda ara')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('query')
          .setLabel('Satıcı veya ürün adı')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(80)
          .setPlaceholder('Örn: kifoz, savunma, baykuş adı'),
      ),
    );
}

export function isSearchModal(customId: string): boolean {
  return stripMarketPrefix(customId) === 'modal:search';
}

export function parsePositiveInt(raw: string, label: string): number {
  const value = parseInt(raw.trim(), 10);
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`${label} en az 1 olmalı.`);
  }
  return value;
}
