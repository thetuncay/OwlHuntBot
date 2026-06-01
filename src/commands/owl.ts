/**
 * owl.ts — /owl slash komutu giriş noktası
 *
 * Bu dosya sadece:
 *   1. SlashCommandBuilder tanımı (data)
 *   2. execute() — slash komutları ilgili modüllere yönlendirir
 *   3. handleOwlTextCommand() — prefix komutları ilgili modüllere yönlendirir
 *
 * İş mantığı ve UI kodu ayrı dosyalarda:
 *   owl-hunt.ts / owl-pvp.ts / owl-tame.ts / owl-upgrade.ts
 *   owl-inventory.ts / owl-stats.ts / owl-transfer.ts
 *   owl-owl.ts / owl-misc.ts / owl-help.ts / owl-utils.ts
 */

import { SlashCommandBuilder, type Message } from 'discord.js';
import type { CommandDefinition } from '../types';
import { ensureRegisteredForInteraction, ensureRegisteredForMessage } from '../systems/onboarding';
import { getGuildPrefix } from '../utils/prefix';
import { failEmbed } from '../utils/embed';
import {
  logCommandError,
} from '../utils/command-error';
import { notifyInteractionUserError, replyWithSuppression, SuppressionKeys } from '../utils/guarded-discord';

// ─── Modül import'ları ────────────────────────────────────────────────────────
import { runHunt, runHuntMessage } from './owl-hunt';
import { runYardim, buildHelpEmbed } from './owl-help';
import { runVs, runDuel, runVsMessage, runDuelMessage } from './owl-pvp';
import { runSetMain, runSetMainMessage, runOwls, runOwlsMessage } from './owl-owl';
import { runInventory, runInventoryMessage } from './owl-inventory';
import { runStats, runStatsMessage } from './owl-stats';
import { runUpgrade, runUpgradeMessage } from './owl-upgrade';
import { runTame, runTameMessage } from './owl-tame';
import { runTransfer, runTransferMessage } from './owl-transfer';
import { runSellMessage, runZooMessage, runCashMessage, runPrefixMessage, runPrefix, runAcMessage, runSkMessage, runEkMessage, runBuffsMessage } from './owl-misc';
import { runCraftMessage, runCraftInfoMessage, runDismantleMessage, runCraftSlash, runDismantleSlash } from './owl-crafting';
import { runUseMessage } from './owl-use';
import { runMarketMessage, runMarketSlash, runBuyMessage, runMarketSellMessage } from './owl-market';
import { runPrestigeMessage, runPrestigeSlash } from './owl-prestige';
import { runQuestsMessage, runQuestsSlash } from './owl-quests';
import { runSoruMessage } from './owl-soru';
import { ALIASES, TEXT_SUBCOMMANDS, findClosest, buildUnknownCommandEmbed } from './owl-utils';
import { runPvpCoinFlip, runPvpSlot, runPvpBlackjack } from './pvp';
import { logCommandEvent } from '../utils/command-telemetry';
import { acquireInFlightAction, releaseInFlightAction } from '../utils/response-suppression';

// ─── Slash komut tanımı ───────────────────────────────────────────────────────

const data = new SlashCommandBuilder()
  .setName('owl')
  .setDescription('Baykus komutlari')
  .addSubcommand((sub) => sub.setName('yardim').setDescription('Oyunun temelini ve komutlari aciklar'))
  .addSubcommand((sub) => sub.setName('hunt').setDescription('Baykusu avlanmaya gonder'))
  .addSubcommand((sub) =>
    sub.setName('vs').setDescription('Bir oyuncuya PvP meydan okumasi gonder')
      .addUserOption((opt) => opt.setName('kullanici').setDescription('Hedef oyuncu').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub.setName('setmain').setDescription('Main baykusu degistir')
      .addStringOption((opt) => opt.setName('baykus').setDescription('Baykus ID').setRequired(true)),
  )
  .addSubcommand((sub) => sub.setName('inventory').setDescription('Envanteri goster'))
  .addSubcommand((sub) =>
    sub.setName('stats').setDescription('Baykus istatistiklerini goster')
      .addBooleanOption((opt) => opt.setName('deep').setDescription('Formul detaylarini ac')),
  )
  .addSubcommand((sub) =>
    sub.setName('upgrade').setDescription('Bir stati yukselt')
      .addStringOption((opt) =>
        opt.setName('stat').setDescription('Stat').setRequired(true)
          .addChoices(
            { name: 'gaga',  value: 'gaga'  },
            { name: 'goz',   value: 'goz'   },
            { name: 'kulak', value: 'kulak' },
            { name: 'kanat', value: 'kanat' },
            { name: 'pence', value: 'pence' },
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName('prefix').setDescription('Bu sunucu icin metin komut prefixini ayarlar')
      .addStringOption((opt) => opt.setName('deger').setDescription('Ornek: w, baykus, oyun').setRequired(true)),
  )
  .addSubcommand((sub) => sub.setName('duel').setDescription('Rastgele bir rakiple bot duel yap'))
  .addSubcommand((sub) =>
    sub.setName('tame').setDescription('Yabani baykusu evcillestirmeye calis')
      .addStringOption((opt) => opt.setName('encounter').setDescription('Encounter ID').setRequired(true)),
  )
  .addSubcommand((sub) => sub.setName('owls').setDescription('Tum baykuslarini listele'))
  .addSubcommand((sub) =>
    sub.setName('ver').setDescription('Bir oyuncuya coin gonder')
      .addUserOption((opt) => opt.setName('kullanici').setDescription('Alici oyuncu').setRequired(true))
      .addIntegerOption((opt) => opt.setName('miktar').setDescription('Gonderilecek coin miktari').setRequired(true).setMinValue(10)),
  )
  .addSubcommand((sub) => sub.setName('craft').setDescription('Eşya üret'))
  .addSubcommand((sub) =>
    sub.setName('dismantle').setDescription('Eşya parçala')
      .addStringOption((opt) => opt.setName('esya').setDescription('Eşya adı').setRequired(true))
      .addIntegerOption((opt) => opt.setName('miktar').setDescription('Miktar').setMinValue(1)),
  )
  .addSubcommand((sub) =>
    sub.setName('market').setDescription('Market işlemleri')
      .addStringOption((opt) =>
        opt.setName('islem').setDescription('İşlem tipi').addChoices(
          { name: 'listele', value: 'list' },
          { name: 'sat', value: 'sell' },
          { name: 'al', value: 'buy' },
        ),
      )
      .addStringOption((opt) => opt.setName('param1').setDescription('Eşya adı veya İlan ID'))
      .addIntegerOption((opt) => opt.setName('param2').setDescription('Miktar veya Fiyat'))
      .addIntegerOption((opt) => opt.setName('param3').setDescription('Fiyat')),
  )
  .addSubcommand((sub) =>
    sub.setName('prestige').setDescription('Ascension (Prestige) işlemleri')
      .addStringOption((opt) => opt.setName('baykus').setDescription('Feda edilecek baykuş ID')),
  )
  .addSubcommand((sub) => sub.setName('quests').setDescription('Günlük görevleri görüntüle'));

// ─── Slash execute ────────────────────────────────────────────────────────────

async function execute(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  try {
    const sub = interaction.options.getSubcommand(true);
    const gate = {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      key: SuppressionKeys.state(`owl-slash:${sub}`),
      ttlMs: 15_000,
    };
    if (!acquireInFlightAction(gate)) return;
    try {

      // Kayıt gerektirmeyen komutlar
      if (sub === 'yardim') { await runYardim(interaction); return; }
      if (sub === 'prefix')  { await runPrefix(interaction, ctx); return; }

      // Diğer tüm komutlar kayıt gerektirir
      const ready = await ensureRegisteredForInteraction(interaction, ctx);
      if (!ready) return;

      switch (sub) {
        case 'hunt':      await runHunt(interaction, ctx);      break;
        case 'vs':        await runVs(interaction, ctx);        break;
        case 'duel':      await runDuel(interaction, ctx);      break;
        case 'setmain':   await runSetMain(interaction, ctx);   break;
        case 'owls':      await runOwls(interaction, ctx);      break;
        case 'inventory': await runInventory(interaction, ctx); break;
        case 'stats':     await runStats(interaction, ctx);     break;
        case 'upgrade':   await runUpgrade(interaction, ctx);   break;
        case 'tame':      await runTame(interaction, ctx);      break;
        case 'ver':       await runTransfer(interaction, ctx);  break;
        case 'craft':     await runCraftSlash(interaction, ctx); break;
        case 'dismantle': await runDismantleSlash(interaction, ctx); break;
        case 'market':    await runMarketSlash(interaction, ctx); break;
        case 'prestige':  await runPrestigeSlash(interaction, ctx); break;
        case 'quests':    await runQuestsSlash(interaction, ctx); break;
        default: throw new Error('Bilinmeyen alt komut.');
      }
    } finally {
      releaseInFlightAction(gate);
    }
  } catch (error) {
    if (await notifyInteractionUserError(interaction, error, {
      useEmbed: true,
      embed: (title, body) => ({ embeds: [failEmbed(title, body)] }),
    })) return;
    logCommandError('Owl Slash Error', error);
  }
}

// ─── Prefix text command handler ──────────────────────────────────────────────

export async function handleOwlTextCommand(
  message: Message,
  parts: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
  guildPrefix?: string,
): Promise<string> {
  const rawSub    = (parts[0] ?? '').toLowerCase();
  const sub       = ALIASES[rawSub] ?? rawSub;
  const gate = {
    userId: message.author.id,
    guildId: message.guildId,
    key: SuppressionKeys.state(`owl-prefix:${sub}`),
    ttlMs: 15_000,
  };
  if (!acquireInFlightAction(gate)) return sub;
  try {
    const args      = parts.slice(1);
    const helpPrefix = (guildPrefix ?? (await getGuildPrefix(ctx.redis, message.guildId ?? ''))) || 'owl';

    // Kayıt gerektirmeyen komutlar
    if (sub === 'yardim' || sub === 'yardım') {
      await message.reply({ embeds: [buildHelpEmbed(helpPrefix)] });
      return sub;
    }
    if (sub === 'prefix') {
      await runPrefixMessage(message, args, ctx);
      return sub;
    }

    // Diğer tüm komutlar kayıt gerektirir
    const ready = await ensureRegisteredForMessage(message, ctx);
    if (!ready) return sub;

    if (message.guildId) {
      logCommandEvent(ctx.prisma, {
        userId: message.author.id,
        guildId: message.guildId,
        command: sub,
      });
    }

    switch (sub) {
      case 'hunt':      await runHuntMessage(message, ctx);                          break;
      case 'stats':     await runStatsMessage(message, args, ctx);                   break;
      case 'inventory': await runInventoryMessage(message, ctx);                     break;
      case 'setmain':   await runSetMainMessage(message, args, ctx, helpPrefix);     break;
      case 'upgrade':   await runUpgradeMessage(message, args, ctx, helpPrefix);     break;
      case 'vs':        await runVsMessage(message, args, ctx);                      break;
      case 'duel':      await runDuelMessage(message, ctx);                          break;
      case 'sell':      await runSellMessage(message, args, ctx, helpPrefix);        break;
      case 'zoo':       await runZooMessage(message, ctx, helpPrefix);               break;
      case 'cash':      await runCashMessage(message, ctx);                          break;
      case 'ver':       await runTransferMessage(message, args, ctx, helpPrefix);    break;
      case 'owls':      await runOwlsMessage(message, ctx);                          break;
      case 'tame':      await runTameMessage(message, args, ctx, helpPrefix); break;
      case 'cf':        await runPvpCoinFlip(message, args, ctx);             break;
      case 'slot':      await runPvpSlot(message, args, ctx);                 break;
      case 'bj':        await runPvpBlackjack(message, args, ctx);            break;
      case 'aç':        await runAcMessage(message, args, ctx, helpPrefix);    break;
      case 'sk':        await runSkMessage(message, args, ctx, helpPrefix);    break;
      case 'ek':        await runEkMessage(message, args, ctx, helpPrefix);    break;
      case 'use':       await runUseMessage(message, args, ctx, helpPrefix);     break;
      case 'buffs':     await runBuffsMessage(message, args, helpPrefix);        break;
      case 'craft':     await runCraftMessage(message, args, ctx, helpPrefix);   break;
      case 'craftinfo': await runCraftInfoMessage(message, args, ctx, helpPrefix); break;
      case 'dismantle': await runDismantleMessage(message, args, ctx, helpPrefix); break;
      case 'market':    await runMarketMessage(message, args, ctx, helpPrefix); break;
      case 'buy':       await runBuyMessage(message, args, ctx);                break;
      case 'msell':     await runMarketSellMessage(message, args, ctx, helpPrefix); break;
      case 'prestige':  await runPrestigeMessage(message, args, ctx, helpPrefix); break;
      case 'quests':    await runQuestsMessage(message, args, ctx, helpPrefix); break;
      case 'soru':      await runSoruMessage(message, args, ctx, helpPrefix);   break;
      default: {
        const suggestion = findClosest(sub, TEXT_SUBCOMMANDS);
        await replyWithSuppression(
          message,
          { embeds: [buildUnknownCommandEmbed(helpPrefix, rawSub, suggestion)] },
          SuppressionKeys.usage('unknown', rawSub || 'empty'),
        );
      }
    }
    return sub;
  } finally {
    releaseInFlightAction(gate);
  }
}

export default { data, execute } satisfies CommandDefinition;
