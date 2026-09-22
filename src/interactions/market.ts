/**
 * interactions/market.ts — Pazar buton / select / modal handler
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type {
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  buyListing,
  cancelListing,
  createListing,
  createOwlListing,
  updateActiveListing,
} from '../systems/market';
import {
  buildScreenCustomId,
  isDeferredMarketScreen,
  isMarketCustomId,
  parseActionListingNo,
  parseBuyActionParams,
  parseMarketCustomId,
  resolveSelectTarget,
  stripMarketPrefix,
} from '../utils/market-customid';
import {
  buildEditListingModal,
  buildSearchModal,
  buildSellModal,
  isEditListingModal,
  isSearchModal,
  isSellModal,
  parseEditListingModalListingNo,
  parsePositiveInt,
  parseSellModalCustomId,
} from '../utils/market-modals';
import {
  getListingByNo,
  resolveSellableItemName,
} from '../utils/market-queries';
import {
  renderBuyConfirmScreen,
  renderBuyErrorScreen,
  renderBuySuccessScreen,
  renderListingCreatedScreen,
  renderMarketScreen,
  renderMyShopItemScreen,
  renderMyShopScreen,
  renderSearchResultsScreen,
  type MarketScreenPayload,
} from '../utils/market-screens';
import { fireQuest } from '../systems/quest-tracker';

export interface MarketInteractionContext {
  prisma: PrismaClient;
  redis: Redis;
}

type MarketInteraction =
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ModalSubmitInteraction;

type ComponentInteraction = ButtonInteraction | StringSelectMenuInteraction;

export { isMarketCustomId };

function targetScreenPath(customId: string): string {
  return stripMarketPrefix(customId);
}

function screenContext(
  interaction: ComponentInteraction | ModalSubmitInteraction,
  ctx: MarketInteractionContext,
) {
  return {
    prisma: ctx.prisma,
    redis: ctx.redis,
    userId: interaction.user.id,
  };
}

async function replyEphemeral(
  interaction: ComponentInteraction | ButtonInteraction | ModalSubmitInteraction,
  content: string,
  components?: ActionRowBuilder<ButtonBuilder>[],
): Promise<void> {
  const payload = {
    content,
    flags: 64 as const,
    ...(components ? { components } : {}),
  };

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
    return;
  }
  await interaction.reply(payload);
}

async function pushScreen(
  interaction: ComponentInteraction,
  payload: MarketScreenPayload,
): Promise<void> {
  const data = {
    content: null,
    embeds: [payload.embed],
    components: payload.components,
  };

  if (interaction.deferred) {
    await interaction.editReply(data);
    return;
  }
  await interaction.update(data);
}

async function navigateToScreen(
  interaction: ComponentInteraction,
  screenId: string,
  ctx: MarketInteractionContext,
): Promise<void> {
  const screenPath = targetScreenPath(screenId);
  if (screenPath === 'search:open') {
    await interaction.showModal(buildSearchModal());
    return;
  }

  if (isDeferredMarketScreen(screenPath)) {
    await replyEphemeral(
      interaction,
      '⏳ Bu ekran henüz kullanılamıyor.',
    );
    return;
  }

  const payload = await renderMarketScreen(screenId, screenContext(interaction, ctx));
  if (screenPath === 'hub') {
    await fireQuest(ctx.prisma, interaction.user.id, 'market_browse', 1);
  } else if (screenPath === 'myshop' || screenPath.startsWith('myshop:')) {
    await fireQuest(ctx.prisma, interaction.user.id, 'market_myshop', 1);
  }
  await pushScreen(interaction, payload);
}

function parseSellSelectValue(value: string): { type: 'item' | 'owl'; itemId: string } | null {
  if (value.startsWith('sell.item.')) {
    return { type: 'item', itemId: value.slice('sell.item.'.length) };
  }
  if (value.startsWith('sell.owl.')) {
    return { type: 'owl', itemId: value.slice('sell.owl.'.length) };
  }
  return null;
}

function sellRetryCustomId(type: 'item' | 'owl', page: number): string {
  return buildScreenCustomId(`sell:select:${type}:${page}`);
}

async function handleSellSelectChoice(
  interaction: StringSelectMenuInteraction,
  ctx: MarketInteractionContext,
): Promise<void> {
  const value = interaction.values[0]!;
  const picked = parseSellSelectValue(value);
  if (!picked) {
    await replyEphemeral(interaction, '❌ Geçersiz seçim.');
    return;
  }

  let maxQuantity = 1;
  if (picked.type === 'item') {
    const resolved = await resolveSellableItemName(
      ctx.prisma,
      interaction.user.id,
      picked.itemId,
    );
    maxQuantity = resolved.maxQuantity;
  }

  await interaction.showModal(
    buildSellModal(picked.type, picked.itemId, { maxQuantity }),
  );
}

async function handleSellModalSubmit(
  interaction: ModalSubmitInteraction,
  ctx: MarketInteractionContext,
  parsedModal: NonNullable<ReturnType<typeof parseSellModalCustomId>>,
): Promise<void> {
  const price = parsePositiveInt(interaction.fields.getTextInputValue('price'), 'Fiyat');
  const noteRaw = interaction.fields.getTextInputValue('note') ?? '';
  const screenCtx = screenContext(interaction, ctx);

  await interaction.deferUpdate();

  try {
    let listing;
    let listingFee;

    if (parsedModal.type === 'item') {
      const { itemName, maxQuantity } = await resolveSellableItemName(
        ctx.prisma,
        interaction.user.id,
        parsedModal.itemId,
      );
      let quantity = 1;
      if (maxQuantity > 1) {
        quantity = parsePositiveInt(
          interaction.fields.getTextInputValue('quantity'),
          'Adet',
        );
        if (quantity > maxQuantity) {
          throw new Error(`En fazla ${maxQuantity} adet satabilirsin.`);
        }
      }
      const result = await createListing(
        ctx.prisma,
        interaction.user.id,
        itemName,
        quantity,
        price,
        ctx.redis,
        noteRaw.trim() || null,
      );
      listing = result.listing;
      listingFee = result.listingFee;
    } else {
      const result = await createOwlListing(
        ctx.prisma,
        interaction.user.id,
        parsedModal.itemId,
        price,
        ctx.redis,
        noteRaw.trim() || null,
      );
      listing = result.listing;
      listingFee = result.listingFee;
    }

    const payload = await renderListingCreatedScreen(screenCtx, listing, listingFee);
    await interaction.editReply({
      content: null,
      embeds: [payload.embed],
      components: payload.components,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Satışa çıkarma başarısız.';
    await interaction.followUp({
      content: `❌ ${message}`,
      flags: 64,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(sellRetryCustomId(parsedModal.type, 0))
            .setLabel('Tekrar Dene')
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
  }
}

async function handleBuyAction(
  interaction: ButtonInteraction,
  ctx: MarketInteractionContext,
  action: 'buyconfirm' | 'buyexecute',
  params: string[],
): Promise<void> {
  const { listingNo, fromEncoded } = parseBuyActionParams(params);
  if (!listingNo) {
    await replyEphemeral(interaction, '❌ Geçersiz ilan.');
    return;
  }

  await interaction.deferUpdate();
  const screenCtx = screenContext(interaction, ctx);

  if (action === 'buyconfirm') {
    const payload = await renderBuyConfirmScreen(screenCtx, listingNo, fromEncoded);
    await pushScreen(interaction, payload);
    return;
  }

  try {
    const result = await buyListing(ctx.prisma, interaction.user.id, String(listingNo), ctx.redis);
    const payload = await renderBuySuccessScreen(screenCtx, result, fromEncoded);
    await pushScreen(interaction, payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Satın alma başarısız.';
    const payload = await renderBuyErrorScreen(screenCtx, message, listingNo, fromEncoded);
    await pushScreen(interaction, payload);
  }
}

async function handleCancelAction(
  interaction: ButtonInteraction,
  ctx: MarketInteractionContext,
  listingNo: number,
): Promise<void> {
  if (!listingNo) {
    await replyEphemeral(interaction, '❌ Geçersiz ilan.');
    return;
  }

  await interaction.deferUpdate();

  try {
    await cancelListing(ctx.prisma, interaction.user.id, String(listingNo), ctx.redis);
    const payload = await renderMyShopScreen(
      screenContext(interaction, ctx),
      'İlan kaldırıldı, eşyan iade edildi.',
    );
    await pushScreen(interaction, payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'İlan kaldırılamadı.';
    await interaction.followUp({ content: `❌ ${message}`, flags: 64 });
    const payload = await renderMyShopItemScreen(screenContext(interaction, ctx), listingNo);
    await pushScreen(interaction, payload);
  }
}

async function handleEditListingOpen(
  interaction: ButtonInteraction,
  ctx: MarketInteractionContext,
  listingNo: number,
): Promise<void> {
  if (!listingNo) {
    await replyEphemeral(interaction, '❌ Geçersiz ilan.');
    return;
  }

  const listing = await getListingByNo(ctx.prisma, listingNo);
  if (
    !listing
    || listing.sellerId !== interaction.user.id
    || listing.status !== 'active'
    || listing.expiresAt <= new Date()
  ) {
    await replyEphemeral(interaction, '❌ Bu ilan düzenlenemez.');
    return;
  }

  await interaction.showModal(buildEditListingModal(listing));
}

async function handleSearchModalSubmit(
  interaction: ModalSubmitInteraction,
  ctx: MarketInteractionContext,
): Promise<void> {
  const query = interaction.fields.getTextInputValue('query').trim();
  if (!query) {
    await interaction.reply({ content: '❌ Arama terimi boş olamaz.', flags: 64 });
    return;
  }

  await interaction.deferUpdate();
  const payload = await renderSearchResultsScreen(screenContext(interaction, ctx), query);
  await interaction.editReply({
    content: null,
    embeds: [payload.embed],
    components: payload.components,
  });
}

async function handleEditListingModalSubmit(
  interaction: ModalSubmitInteraction,
  ctx: MarketInteractionContext,
  listingNo: number,
): Promise<void> {
  const price = parsePositiveInt(interaction.fields.getTextInputValue('price'), 'Fiyat');
  const noteRaw = interaction.fields.getTextInputValue('note') ?? '';
  const screenCtx = screenContext(interaction, ctx);

  let quantity: number | undefined;
  const listing = await getListingByNo(ctx.prisma, listingNo);
  if (listing && listing.marketCategory !== 'owl') {
    quantity = parsePositiveInt(interaction.fields.getTextInputValue('quantity'), 'Adet');
  }

  await interaction.deferUpdate();

  try {
    await updateActiveListing(
      ctx.prisma,
      interaction.user.id,
      String(listingNo),
      {
        price,
        quantity,
        sellerNote: noteRaw.trim() || null,
      },
      ctx.redis,
    );
    const payload = await renderMyShopItemScreen(screenCtx, listingNo);
    await interaction.editReply({
      content: null,
      embeds: [payload.embed],
      components: payload.components,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'İlan güncellenemedi.';
    await interaction.followUp({
      content: `❌ ${message}`,
      flags: 64,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(buildScreenCustomId(`action:editlisting:${listingNo}`))
            .setLabel('Tekrar Dene')
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
  }
}

function resolveNavigationTarget(interaction: ComponentInteraction): string | null {
  if (interaction.isStringSelectMenu()) {
    const value = interaction.values[0]!;
    if (parseSellSelectValue(value)) return null;
    return resolveSelectTarget(interaction.customId, value);
  }
  return interaction.customId;
}

function needsDeferBeforeNavigate(screenId: string): boolean {
  const screenPath = targetScreenPath(screenId);
  if (screenPath === 'search:open') return false;
  return !isDeferredMarketScreen(screenPath);
}

export async function handleMarketInteraction(
  interaction: MarketInteraction,
  ctx: MarketInteractionContext,
): Promise<void> {
  if (interaction.isModalSubmit() && isSellModal(interaction.customId)) {
    const parsedModal = parseSellModalCustomId(interaction.customId);
    if (!parsedModal) {
      await interaction.reply({ content: '❌ Geçersiz form.', flags: 64 });
      return;
    }
    await handleSellModalSubmit(interaction, ctx, parsedModal);
    return;
  }

  if (interaction.isModalSubmit() && isSearchModal(interaction.customId)) {
    await handleSearchModalSubmit(interaction, ctx);
    return;
  }

  if (interaction.isModalSubmit() && isEditListingModal(interaction.customId)) {
    const listingNo = parseEditListingModalListingNo(interaction.customId);
    if (!listingNo) {
      await interaction.reply({ content: '❌ Geçersiz form.', flags: 64 });
      return;
    }
    await handleEditListingModalSubmit(interaction, ctx, listingNo);
    return;
  }

  if (interaction.isModalSubmit()) {
    await interaction.reply({
      content: '⏳ Bu form henüz kullanılamıyor.',
      flags: 64,
    });
    return;
  }

  const parsed = parseMarketCustomId(interaction.customId);

  if (parsed.kind === 'action' && interaction.isButton()) {
    const action = parsed.action;
    const params = parsed.actionParams ?? [];

    if (action === 'buyconfirm' || action === 'buyexecute') {
      await handleBuyAction(interaction, ctx, action, params);
      return;
    }

    if (action === 'cancel') {
      await handleCancelAction(interaction, ctx, parseActionListingNo(params));
      return;
    }

    if (action === 'editlisting' || action === 'editnote') {
      await handleEditListingOpen(interaction, ctx, parseActionListingNo(params));
      return;
    }

    await replyEphemeral(interaction, '⏳ Bu işlem henüz kullanılamıyor.');
    return;
  }

  if (interaction.isStringSelectMenu() && parseSellSelectValue(interaction.values[0]!)) {
    await handleSellSelectChoice(interaction, ctx);
    return;
  }

  const targetId = resolveNavigationTarget(interaction);
  if (!targetId) return;

  if (needsDeferBeforeNavigate(targetId)) {
    await interaction.deferUpdate();
  }

  await navigateToScreen(interaction, targetId, ctx);
}
