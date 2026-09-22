/**
 * interactions/trade.ts — Trade buton / select / modal handler
 *
 * Public board = teklif özeti.
 * Eşya paneli = ephemeral grid (seri ekleme, yazma yok).
 */

import type {
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  TextChannel,
} from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  TradeError,
  acceptTradeInvite,
  abortTradeConfirm,
  bindTradeMessage,
  cancelTrade,
  cancelTradeInvite,
  getTradeInvite,
  getTradeSession,
  tradeAddItem,
  tradeAddOwl,
  tradeFinalConfirm,
  tradeRemoveItem,
  tradeRemoveOwl,
  tradeSetCoins,
  tradeToggleReady,
  type TradeSession,
} from '../systems/trade';
import {
  isTradeCustomId,
  parseBoardAction,
  parseCoinModal,
  parseInviteAction,
  parsePickCat,
  parsePickGridBack,
  parsePickItem,
  parsePickPage,
  parsePickQty,
  parsePickQtyModal,
  parseRemoveOwlSelect,
  parseRemoveSelect,
} from '../utils/trade-customid';
import {
  buildTradeCoinModal,
  buildTradeCustomQtyModal,
  parsePositiveInt,
} from '../utils/trade-modals';
import {
  decodeItemNameValue,
  loadTradeInventory,
  renderTradeBoard,
  renderTradeItemPanel,
  renderTradeQtyPanel,
  renderTradeRemovePicker,
  tradeCoinAvailability,
  type TradeScreenPayload,
} from '../utils/trade-screens';
import {
  isOwlPickKey,
  loadTradePickCache,
  owlIdFromPickKey,
  resolvePickKey,
  type TradePickCat,
} from '../utils/trade-pick-cache';
import { formatTradeItemLine } from '../utils/trade-emoji';
import { getOwlPrimaryName } from '../utils/owl-display';
import { renderOwlMoonEmoji } from '../config/custom-emojis';

export interface TradeInteractionContext {
  prisma: PrismaClient;
  redis: Redis;
}

type TradeInteraction =
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ModalSubmitInteraction;

export { isTradeCustomId };

const EPHEMERAL = 64 as const;

async function ephemeral(
  interaction: TradeInteraction,
  content: string,
): Promise<void> {
  const payload = { content, flags: EPHEMERAL };
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
    return;
  }
  await interaction.reply(payload);
}

async function editPublicBoard(
  interaction: TradeInteraction,
  session: TradeSession,
  board: TradeScreenPayload,
): Promise<void> {
  if (!session.messageId) return;
  const channel = interaction.channel;
  if (!channel || !channel.isTextBased() || !('messages' in channel)) return;
  await (channel as TextChannel).messages.edit(session.messageId, {
    content: null,
    embeds: [board.embed],
    components: board.components,
  });
}

async function dismissPrivate(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  content: string,
): Promise<void> {
  await interaction.update({ content, embeds: [], components: [] });
}

async function pushPrivatePanel(
  interaction: ButtonInteraction,
  panel: TradeScreenPayload,
  asUpdate: boolean,
): Promise<void> {
  if (asUpdate) {
    await interaction.update({
      content: null,
      embeds: [panel.embed],
      components: panel.components,
    });
    return;
  }
  await interaction.reply({
    embeds: [panel.embed],
    components: panel.components,
    flags: EPHEMERAL,
  });
}

async function handleInvite(
  interaction: ButtonInteraction,
  ctx: TradeInteractionContext,
  action: 'accept' | 'decline' | 'cancel',
  inviteId: string,
): Promise<void> {
  const invite = await getTradeInvite(ctx.redis, inviteId);

  if (!invite) {
    await interaction.update({
      content: 'Trade daveti süresi doldu veya geçersiz.',
      embeds: [],
      components: [],
    }).catch(async () => {
      await ephemeral(interaction, 'Trade daveti süresi doldu veya geçersiz.');
    });
    return;
  }

  if (action === 'cancel') {
    if (invite.fromId !== interaction.user.id) {
      await ephemeral(interaction, 'Bu daveti yalnızca gönderen iptal edebilir.');
      return;
    }
    await cancelTradeInvite(ctx.redis, inviteId);
    await interaction.update({ content: 'Trade daveti iptal edildi.', embeds: [], components: [] });
    return;
  }

  if (action === 'decline') {
    if (invite.toId !== interaction.user.id) {
      await ephemeral(interaction, 'Bu daveti yalnızca davet edilen reddedebilir.');
      return;
    }
    await cancelTradeInvite(ctx.redis, inviteId);
    await interaction.update({
      content: `**${invite.toName}** trade davetini reddetti.`,
      embeds: [],
      components: [],
    });
    return;
  }

  if (invite.toId !== interaction.user.id) {
    await ephemeral(interaction, 'Bu daveti yalnızca davet edilen kabul edebilir.');
    return;
  }

  const session = await acceptTradeInvite(ctx.redis, inviteId, interaction.user.id);
  const board = renderTradeBoard(session, interaction.user.id);
  await interaction.update({
    content: null,
    embeds: [board.embed],
    components: board.components,
  });
  await bindTradeMessage(ctx.redis, session.id, interaction.message.id);
}

async function openItemPanel(
  interaction: ButtonInteraction,
  ctx: TradeInteractionContext,
  session: TradeSession,
  asUpdate: boolean,
  opts?: { cat?: TradePickCat; page?: number; flash?: string | null },
): Promise<void> {
  const panel = await renderTradeItemPanel(
    ctx.prisma,
    ctx.redis,
    session,
    interaction.user.id,
    opts,
  );
  await pushPrivatePanel(interaction, panel, asUpdate);
}

async function handleBoard(
  interaction: ButtonInteraction,
  ctx: TradeInteractionContext,
  sessionId: string,
  action: string,
): Promise<void> {
  const session = await getTradeSession(ctx.redis, sessionId);
  if (!session) {
    await ephemeral(interaction, 'Trade bulunamadı.');
    return;
  }
  const uid = interaction.user.id;
  if (uid !== session.a.userId && uid !== session.b.userId) {
    await ephemeral(interaction, 'Bu trade sana ait değil.');
    return;
  }

  if (action === 'dismiss') {
    await dismissPrivate(interaction, 'Kapatıldı.');
    return;
  }

  if (action === 'item') {
    const side = session.a.userId === uid ? session.a : session.b;
    if (side.ready || session.a.ready || session.b.ready) {
      await ephemeral(
        interaction,
        'Teklif kilitli. Değiştirmek için hazır olan taraf **Hazır**’a tekrar bassın.',
      );
      return;
    }
    await openItemPanel(interaction, ctx, session, false);
    return;
  }

  if (action === 'remove') {
    const side = session.a.userId === uid ? session.a : session.b;
    if (side.ready || session.a.ready || session.b.ready) {
      await ephemeral(
        interaction,
        'Teklif kilitli. Değiştirmek için hazır olan taraf **Hazır**’a tekrar bassın.',
      );
      return;
    }
    const picker = renderTradeRemovePicker(session, uid);
    await interaction.reply({
      embeds: [picker.embed],
      components: picker.components,
      flags: EPHEMERAL,
    });
    return;
  }

  if (action === 'coin') {
    const side = session.a.userId === uid ? session.a : session.b;
    if (side.ready || session.a.ready || session.b.ready) {
      await ephemeral(
        interaction,
        'Teklif kilitli. Değiştirmek için hazır olan taraf **Hazır**’a tekrar bassın.',
      );
      return;
    }
    const avail = await tradeCoinAvailability(ctx.redis, ctx.prisma, session, uid);
    await interaction.showModal(
      buildTradeCoinModal({
        sessionId,
        available: avail.available,
        currentOffer: avail.currentOffer,
      }),
    );
    return;
  }

  if (action === 'ready') {
    const before = session.a.userId === uid ? session.a : session.b;
    const wasReady = before.ready;
    const next = await tradeToggleReady(ctx.redis, sessionId, uid);
    const board = renderTradeBoard(next, uid);
    await interaction.update({ embeds: [board.embed], components: board.components });

    if (next.phase === 'confirming') {
      return;
    }

    const after = next.a.userId === uid ? next.a : next.b;
    if (after.ready && !wasReady) {
      await interaction.followUp({
        content: 'Hazır — teklif kilitlendi. Ekleme paneli kapandı. Değiştirmek için tekrar **Hazır**.',
        flags: EPHEMERAL,
      });
      return;
    }
    if (wasReady && !after.ready) {
      const panel = await renderTradeItemPanel(
        ctx.prisma,
        ctx.redis,
        next,
        uid,
        { flash: 'Kilit açıldı — tekrar ekleyebilirsin.' },
      );
      await interaction.followUp({
        embeds: [panel.embed],
        components: panel.components,
        flags: EPHEMERAL,
      });
    }
    return;
  }

  if (action === 'cancel') {
    const cancelled = await cancelTrade(ctx.redis, ctx.prisma, sessionId, uid);
    const board = renderTradeBoard(cancelled, uid);
    await interaction.update({ embeds: [board.embed], components: board.components });
    return;
  }

  if (action === 'confirm') {
    const result = await tradeFinalConfirm(ctx.redis, ctx.prisma, sessionId, uid);
    const board = renderTradeBoard(result.session, uid);
    await interaction.update({ embeds: [board.embed], components: board.components });
    return;
  }

  if (action === 'abort') {
    const next = await abortTradeConfirm(ctx.redis, sessionId, uid);
    const board = renderTradeBoard(next, uid);
    await interaction.update({ embeds: [board.embed], components: board.components });
    return;
  }

  if (action === 'back') {
    const board = renderTradeBoard(session, uid);
    await interaction.update({ embeds: [board.embed], components: board.components });
    return;
  }

  await ephemeral(interaction, 'Bilinmeyen trade aksiyonu.');
}

async function handlePickItem(
  interaction: ButtonInteraction,
  ctx: TradeInteractionContext,
  sessionId: string,
  absIndex: number,
): Promise<void> {
  const session = await getTradeSession(ctx.redis, sessionId);
  if (!session) {
    await ephemeral(interaction, 'Trade bulunamadı.');
    return;
  }
  const uid = interaction.user.id;
  const cache = await loadTradePickCache(ctx.redis, sessionId, uid);
  if (!cache) {
    await openItemPanel(interaction, ctx, session, true, {
      flash: 'Panel süresi doldu — yeniden açıldı.',
    });
    return;
  }
  const pickKey = resolvePickKey(cache, absIndex);
  if (!pickKey) {
    await ephemeral(interaction, 'Geçersiz seçim.');
    return;
  }

  if (isOwlPickKey(pickKey)) {
    const owlId = owlIdFromPickKey(pickKey);
    if (!owlId) {
      await ephemeral(interaction, 'Geçersiz baykuş.');
      return;
    }
    try {
      const next = await tradeAddOwl(ctx.redis, ctx.prisma, sessionId, uid, owlId);
      const board = renderTradeBoard(next, uid);
      await editPublicBoard(interaction, next, board);
      const side = next.a.userId === uid ? next.a : next.b;
      const owl = side.owls.find((o) => o.owlId === owlId);
      const flash = owl
        ? `Eklendi: ${renderOwlMoonEmoji(owl.tier, owl.moonTier)} **${getOwlPrimaryName(owl)}**`
        : 'Baykuş eklendi.';
      await openItemPanel(interaction, ctx, next, true, {
        cat: cache.cat,
        page: cache.page,
        flash,
      });
    } catch (err) {
      const msg = err instanceof TradeError ? err.message : 'Eklenemedi.';
      await openItemPanel(interaction, ctx, session, true, {
        cat: cache.cat,
        page: cache.page,
        flash: `⚠ ${msg}`,
      });
    }
    return;
  }

  const itemName = pickKey;
  const inv = await loadTradeInventory(ctx.prisma, ctx.redis, uid);
  const entry = inv.find((i) => i.itemName === itemName);
  if (!entry || entry.quantity < 1) {
    await openItemPanel(interaction, ctx, session, true, {
      cat: cache.cat,
      page: cache.page,
      flash: 'Bu eşya kalmadı.',
    });
    return;
  }
  const qtyPanel = renderTradeQtyPanel(session, absIndex, entry);
  await interaction.update({
    content: null,
    embeds: [qtyPanel.embed],
    components: qtyPanel.components,
  });
}

async function handlePickQty(
  interaction: ButtonInteraction,
  ctx: TradeInteractionContext,
  sessionId: string,
  absIndex: number,
  amount: number | 'max' | 'custom',
): Promise<void> {
  const uid = interaction.user.id;
  const cache = await loadTradePickCache(ctx.redis, sessionId, uid);
  const session = await getTradeSession(ctx.redis, sessionId);
  if (!session) {
    await ephemeral(interaction, 'Trade bulunamadı.');
    return;
  }
  if (!cache) {
    await openItemPanel(interaction, ctx, session, true, {
      flash: 'Panel süresi doldu — yeniden açıldı.',
    });
    return;
  }
  const pickKey = resolvePickKey(cache, absIndex);
  if (!pickKey || isOwlPickKey(pickKey)) {
    await ephemeral(interaction, 'Geçersiz eşya.');
    return;
  }
  const itemName = pickKey;

  const inv = await loadTradeInventory(ctx.prisma, ctx.redis, uid);
  const entry = inv.find((i) => i.itemName === itemName);
  if (!entry || entry.quantity < 1) {
    await openItemPanel(interaction, ctx, session, true, {
      cat: cache.cat,
      page: cache.page,
      flash: 'Bu eşya kalmadı.',
    });
    return;
  }

  if (amount === 'custom') {
    await interaction.showModal(
      buildTradeCustomQtyModal({
        sessionId,
        absIndex,
        itemName: entry.itemName,
        maxQuantity: entry.quantity,
      }),
    );
    return;
  }

  const qty = amount === 'max' ? entry.quantity : amount;
  if (qty < 1 || qty > entry.quantity) {
    await ephemeral(interaction, 'Geçersiz miktar.');
    return;
  }

  try {
    const next = await tradeAddItem(ctx.redis, ctx.prisma, sessionId, uid, itemName, qty);
    const board = renderTradeBoard(next, uid);
    await editPublicBoard(interaction, next, board);
    await openItemPanel(interaction, ctx, next, true, {
      cat: cache.cat,
      page: cache.page,
      flash: `Eklendi: ${formatTradeItemLine({
        itemName,
        itemType: entry.itemType,
        quantity: qty,
      })}`,
    });
  } catch (err) {
    const msg = err instanceof TradeError ? err.message : 'Eklenemedi.';
    await openItemPanel(interaction, ctx, session, true, {
      cat: cache.cat,
      page: cache.page,
      flash: `⚠ ${msg}`,
    });
  }
}

async function handleCustomQtyModal(
  interaction: ModalSubmitInteraction,
  ctx: TradeInteractionContext,
  sessionId: string,
  absIndex: number,
): Promise<void> {
  const uid = interaction.user.id;
  const n = parsePositiveInt(interaction.fields.getTextInputValue('quantity'));
  if (n == null || n < 1) {
    await ephemeral(interaction, 'Geçersiz miktar.');
    return;
  }

  const cache = await loadTradePickCache(ctx.redis, sessionId, uid);
  const session = await getTradeSession(ctx.redis, sessionId);
  if (!session) {
    await ephemeral(interaction, 'Trade bulunamadı.');
    return;
  }
  if (!cache) {
    await interaction.deferUpdate();
    const panel = await renderTradeItemPanel(ctx.prisma, ctx.redis, session, uid, {
      flash: 'Panel süresi doldu — yeniden açıldı.',
    });
    await interaction.editReply({
      content: null,
      embeds: [panel.embed],
      components: panel.components,
    });
    return;
  }

  const pickKey = resolvePickKey(cache, absIndex);
  if (!pickKey || isOwlPickKey(pickKey)) {
    await ephemeral(interaction, 'Geçersiz eşya.');
    return;
  }
  const itemName = pickKey;
  const inv = await loadTradeInventory(ctx.prisma, ctx.redis, uid);
  const entry = inv.find((i) => i.itemName === itemName);
  if (!entry || entry.quantity < 1) {
    await interaction.deferUpdate();
    const panel = await renderTradeItemPanel(ctx.prisma, ctx.redis, session, uid, {
      cat: cache.cat,
      page: cache.page,
      flash: 'Bu eşya kalmadı.',
    });
    await interaction.editReply({
      content: null,
      embeds: [panel.embed],
      components: panel.components,
    });
    return;
  }
  if (n > entry.quantity) {
    await ephemeral(interaction, `En fazla ×${entry.quantity} ekleyebilirsin.`);
    return;
  }

  await interaction.deferUpdate();
  try {
    const next = await tradeAddItem(ctx.redis, ctx.prisma, sessionId, uid, itemName, n);
    const board = renderTradeBoard(next, uid);
    await editPublicBoard(interaction, next, board);
    const panel = await renderTradeItemPanel(ctx.prisma, ctx.redis, next, uid, {
      cat: cache.cat,
      page: cache.page,
      flash: `Eklendi: ${formatTradeItemLine({
        itemName,
        itemType: entry.itemType,
        quantity: n,
      })}`,
    });
    await interaction.editReply({
      content: null,
      embeds: [panel.embed],
      components: panel.components,
    });
  } catch (err) {
    const msg = err instanceof TradeError ? err.message : 'Eklenemedi.';
    const panel = await renderTradeItemPanel(ctx.prisma, ctx.redis, session, uid, {
      cat: cache.cat,
      page: cache.page,
      flash: `⚠ ${msg}`,
    });
    await interaction.editReply({
      content: null,
      embeds: [panel.embed],
      components: panel.components,
    });
  }
}

async function handleRemoveSelect(
  interaction: StringSelectMenuInteraction,
  ctx: TradeInteractionContext,
  sessionId: string,
): Promise<void> {
  const uid = interaction.user.id;
  const raw = interaction.values[0];
  if (!raw) {
    await ephemeral(interaction, 'Eşya seçilmedi.');
    return;
  }
  const itemName = decodeItemNameValue(raw);
  const session = await tradeRemoveItem(ctx.redis, ctx.prisma, sessionId, uid, itemName);
  const board = renderTradeBoard(session, uid);
  await editPublicBoard(interaction, session, board);
  await dismissPrivate(interaction, `Kaldırıldı: **${itemName}** · trade paneli güncellendi.`);
}

async function handleRemoveOwlSelect(
  interaction: StringSelectMenuInteraction,
  ctx: TradeInteractionContext,
  sessionId: string,
): Promise<void> {
  const uid = interaction.user.id;
  const raw = interaction.values[0];
  if (!raw) {
    await ephemeral(interaction, 'Baykuş seçilmedi.');
    return;
  }
  const owlId = decodeItemNameValue(raw);
  const session = await tradeRemoveOwl(ctx.redis, ctx.prisma, sessionId, uid, owlId);
  const board = renderTradeBoard(session, uid);
  await editPublicBoard(interaction, session, board);
  await dismissPrivate(interaction, 'Baykuş trade’den kaldırıldı · panel güncellendi.');
}

/**
 * Trade interaction router.
 */
export async function handleTradeInteraction(
  interaction: TradeInteraction,
  ctx: TradeInteractionContext,
): Promise<void> {
  try {
    if (interaction.isButton()) {
      const invite = parseInviteAction(interaction.customId);
      if (invite) {
        await handleInvite(interaction, ctx, invite.action, invite.inviteId);
        return;
      }

      const pickItem = parsePickItem(interaction.customId);
      if (pickItem) {
        await handlePickItem(interaction, ctx, pickItem.sessionId, pickItem.absIndex);
        return;
      }

      const pickQty = parsePickQty(interaction.customId);
      if (pickQty) {
        await handlePickQty(
          interaction,
          ctx,
          pickQty.sessionId,
          pickQty.absIndex,
          pickQty.amount,
        );
        return;
      }

      const pickPage = parsePickPage(interaction.customId);
      if (pickPage) {
        const session = await getTradeSession(ctx.redis, pickPage.sessionId);
        if (!session) {
          await ephemeral(interaction, 'Trade bulunamadı.');
          return;
        }
        const cache = await loadTradePickCache(
          ctx.redis,
          pickPage.sessionId,
          interaction.user.id,
        );
        await openItemPanel(interaction, ctx, session, true, {
          cat: cache?.cat ?? 'all',
          page: pickPage.page,
        });
        return;
      }

      const pickCat = parsePickCat(interaction.customId);
      if (pickCat) {
        const session = await getTradeSession(ctx.redis, pickCat.sessionId);
        if (!session) {
          await ephemeral(interaction, 'Trade bulunamadı.');
          return;
        }
        await openItemPanel(interaction, ctx, session, true, {
          cat: pickCat.cat as TradePickCat,
          page: 0,
        });
        return;
      }

      const gridBack = parsePickGridBack(interaction.customId);
      if (gridBack) {
        const session = await getTradeSession(ctx.redis, gridBack.sessionId);
        if (!session) {
          await ephemeral(interaction, 'Trade bulunamadı.');
          return;
        }
        const cache = await loadTradePickCache(
          ctx.redis,
          gridBack.sessionId,
          interaction.user.id,
        );
        await openItemPanel(interaction, ctx, session, true, {
          cat: cache?.cat ?? 'all',
          page: cache?.page ?? 0,
        });
        return;
      }

      const board = parseBoardAction(interaction.customId);
      if (board) {
        await handleBoard(interaction, ctx, board.sessionId, board.action);
        return;
      }
    }

    if (interaction.isStringSelectMenu()) {
      const rm = parseRemoveSelect(interaction.customId);
      if (rm) {
        await handleRemoveSelect(interaction, ctx, rm.sessionId);
        return;
      }
      const rmOwl = parseRemoveOwlSelect(interaction.customId);
      if (rmOwl) {
        await handleRemoveOwlSelect(interaction, ctx, rmOwl.sessionId);
        return;
      }
    }

    if (interaction.isModalSubmit()) {
      const qtyModal = parsePickQtyModal(interaction.customId);
      if (qtyModal) {
        await handleCustomQtyModal(
          interaction,
          ctx,
          qtyModal.sessionId,
          qtyModal.absIndex,
        );
        return;
      }

      const coin = parseCoinModal(interaction.customId);
      if (coin) {
        const n = parsePositiveInt(interaction.fields.getTextInputValue('amount'));
        if (n == null) {
          await ephemeral(interaction, 'Geçersiz miktar.');
          return;
        }
        await interaction.deferUpdate();
        const session = await tradeSetCoins(
          ctx.redis,
          ctx.prisma,
          coin.sessionId,
          interaction.user.id,
          n,
        );
        const board = renderTradeBoard(session, interaction.user.id);
        await interaction.editReply({
          embeds: [board.embed],
          components: board.components,
        });
        return;
      }
    }
  } catch (err) {
    const msg = err instanceof TradeError ? err.message : 'Trade işlemi başarısız.';
    await ephemeral(interaction, msg);
  }
}
