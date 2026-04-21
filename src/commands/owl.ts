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
import { runSellMessage, runZooMessage, runCashMessage, runPrefixMessage, runPrefix, runAcMessage, runBuffMessage } from './owl-misc';
import { ALIASES, TEXT_SUBCOMMANDS, findClosest, buildUnknownCommandEmbed } from './owl-utils';
import { runPvpCoinFlip, runPvpSlot, runPvpBlackjack } from './pvp';

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
  );

// ─── Slash execute ────────────────────────────────────────────────────────────

async function execute(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  try {
    const sub = interaction.options.getSubcommand(true);

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
      default: throw new Error('Bilinmeyen alt komut.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bir seyler ters gitti.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [failEmbed('Hata', message)], flags: 64 });
    } else {
      await interaction.reply({ embeds: [failEmbed('Hata', message)], flags: 64 });
    }
  }
}

// ─── Prefix text command handler ──────────────────────────────────────────────

export async function handleOwlTextCommand(
  message: Message,
  parts: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const rawSub    = (parts[0] ?? '').toLowerCase();
  const sub       = ALIASES[rawSub] ?? rawSub;
  const args      = parts.slice(1);
  const helpPrefix = (await getGuildPrefix(ctx.redis, message.guildId ?? '')) || 'owl';

  // Kayıt gerektirmeyen komutlar
  if (sub === 'yardim' || sub === 'yardim') {
    await message.reply({ embeds: [buildHelpEmbed(helpPrefix)] });
    return;
  }
  if (sub === 'prefix') {
    await runPrefixMessage(message, args, ctx);
    return;
  }

  // Diğer tüm komutlar kayıt gerektirir
  const ready = await ensureRegisteredForMessage(message, ctx);
  if (!ready) return;

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
    case 'buff':      await runBuffMessage(message, args, ctx, helpPrefix);  break;
    default: {
      const suggestion = findClosest(sub, TEXT_SUBCOMMANDS);
      await message.reply({ embeds: [buildUnknownCommandEmbed(helpPrefix, rawSub, suggestion)] });
    }
  }
}

export default { data, execute } satisfies CommandDefinition;
