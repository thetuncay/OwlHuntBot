/**
 * owl.ts — prefix komut giriş noktası
 *
 * handleOwlTextCommand() — prefix komutları ilgili modüllere yönlendirir.
 * İş mantığı: owl-hunt, owl-pvp, owl-market, owl-help, … modülleri.
 */

import { type Message } from 'discord.js';
import type { CommandDefinition } from '../types';
import { ensureRegisteredForMessage } from '../systems/onboarding';
import { getGuildPrefix } from '../utils/prefix';
import {
  notifyInflightBusy,
  replyWithSuppression,
  SuppressionKeys,
} from '../utils/guarded-discord';

import { runHuntMessage } from './owl-hunt';
import { runYardimMessage } from './owl-help';
import { runVsMessage, runDuelMessage } from './owl-pvp';
import { runSetMainMessage, runOwlsMessage, runOwllistMessage, runOwlRenameMessage } from './owl-owl';
import { runInventoryMessage } from './owl-inventory';
import { runStatsMessage } from './owl-stats';
import { runUpgradeMessage } from './owl-upgrade';
import { runEvrimMessage } from './owl-evrim';
import { runTameMessage } from './owl-tame';
import { runTransferMessage } from './owl-transfer';
import {
  runSellMessage,
  runZooMessage,
  runCashMessage,
  runXpMessage,
  runPrefixMessage,
  runAcMessage,
  runSkMessage,
  runEkMessage,
  runTelafiMessage,
  runKumarStatsMessage,
  runKudosMessage,
  runMentorMessage,
} from './owl-misc';
import { runDismantleMessage } from './owl-dismantle';
import { runUseMessage } from './owl-use';
import { runKatalogMessage } from './owl-katalog';
import { runRuneMessage } from './owl-runes';
import { runMarketMessage, runBuyMessage, runMarketSellMessage, runMarketSellerMessage } from './owl-market';
import { runTradeMessage } from './owl-trade';
import { runPrestigeMessage } from './owl-prestige';
import { runQuestsMessage } from './owl-quests';
import { runDailyLoginMessage } from './owl-daily';
import { runSocialActionMessage, isSocialActionCommand } from './owl-social';
import { runAdminModMessage } from './admin-moderation';
import { runOwlOnlyMessage } from './owlonly';
import { isAdmin } from '../utils/admin-access';
import { TEXT_SUBCOMMANDS, findClosest, buildUnknownCommandEmbed, resolveOwlSubcommand } from './owl-utils';
import { runPvpSlot, runPvpBlackjack, runPvpCoinFlip } from './pvp';
import { runCfMessage } from './coinflip';
import { runDuelBetMessage } from './duelbet';
import { logCommandEvent } from '../utils/command-telemetry';
import { acquireInFlightAction, releaseInFlightAction } from '../utils/response-suppression';
import { acquireRedisInFlight, releaseRedisInFlight } from '../middleware/flow-inflight';
import { COMMAND_INFLIGHT_TTL_MS } from '../config';

export async function handleOwlTextCommand(
  message: Message,
  parts: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
  guildPrefix?: string,
): Promise<string> {
  const sub = resolveOwlSubcommand(parts[0] ?? '');
  const gate = {
    userId: message.author.id,
    guildId: message.guildId,
    key: SuppressionKeys.state(`owl-prefix:${sub}`),
    ttlMs: COMMAND_INFLIGHT_TTL_MS,
  };
  const redisInflightOk = await acquireRedisInFlight(ctx.redis, message.author.id, `prefix:${sub}`);
  const memInflightOk = acquireInFlightAction(gate);
  if (!redisInflightOk || !memInflightOk) {
    const name = message.member?.displayName ?? message.author.displayName ?? message.author.username;
    await notifyInflightBusy(
      message,
      name,
      SuppressionKeys.state(`owl-prefix-busy:${sub}`),
      { redis: ctx.redis, command: sub },
    );
    if (memInflightOk) releaseInFlightAction(gate);
    if (redisInflightOk) await releaseRedisInFlight(ctx.redis, message.author.id, `prefix:${sub}`);
    return sub;
  }
  try {
    const args = parts.slice(1);
    const helpPrefix = (guildPrefix ?? (await getGuildPrefix(ctx.redis, message.guildId ?? ''))) || 'owl';

    if (sub === 'yardim') {
      await runYardimMessage(message, args, ctx.redis, message.author.id, helpPrefix);
      return sub;
    }
    if (sub === 'prefix') {
      await runPrefixMessage(message, args, ctx);
      return sub;
    }
    if (sub === 'owlonly') {
      await runOwlOnlyMessage(message, args, ctx);
      return sub;
    }
    if (sub === 'admin' || sub === 'ceza') {
      if (!isAdmin(message.author.id)) {
        await replyWithSuppression(
          message,
          '❌ Bu komutu sadece bot admin kullanabilir.',
          SuppressionKeys.permission('admin-mod'),
        );
        return sub;
      }
      await runAdminModMessage(message, args, ctx, helpPrefix);
      return sub;
    }

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
      case 'stats':     await runStatsMessage(message, args, ctx, helpPrefix);       break;
      case 'inventory': await runInventoryMessage(message, ctx, helpPrefix);       break;
      case 'setmain':   await runSetMainMessage(message, args, ctx, helpPrefix);     break;
      case 'upgrade':   await runUpgradeMessage(message, args, ctx, helpPrefix);     break;
      case 'vs':        await runVsMessage(message, args, ctx);                      break;
      case 'duel':      await runDuelMessage(message, ctx);                          break;
      case 'sell':      await runSellMessage(message, args, ctx, helpPrefix);        break;
      case 'zoo':       await runZooMessage(message, ctx, helpPrefix);               break;
      case 'cash':      await runCashMessage(message, ctx);                          break;
      case 'xp':        await runXpMessage(message, ctx);                            break;
      case 'telafi':    await runTelafiMessage(message, args, ctx);                  break;
      case 'ver':       await runTransferMessage(message, args, ctx, helpPrefix);    break;
      case 'owls':      await runOwlsMessage(message, ctx, helpPrefix);               break;
      case 'evrim':     await runEvrimMessage(message, ctx, helpPrefix);              break;
      case 'owllist':   await runOwllistMessage(message, args, ctx, helpPrefix);    break;
      case 'owl': {
        const owlSub = (args[0] ?? '').toLowerCase();
        if (owlSub === 'name') {
          await runOwlRenameMessage(message, args.slice(1), ctx, helpPrefix);
        } else {
          await replyWithSuppression(
            message,
            { embeds: [buildUnknownCommandEmbed(helpPrefix, `owl ${owlSub || ''}`.trim(), 'name')] },
            SuppressionKeys.usage('unknown', `owl-${owlSub || 'empty'}`),
          );
        }
        break;
      }
      case 'tame':      await runTameMessage(message, args, ctx, helpPrefix); break;
      case 'duelbet':   await runDuelBetMessage(message, args, ctx);            break;
      case 'cf':        await runCfMessage(message, args, ctx);               break;
      case 'slot':      await runPvpSlot(message, args, ctx);                 break;
      case 'bj':        await runPvpBlackjack(message, args, ctx);            break;
      case 'aç':        await runAcMessage(message, args, ctx, helpPrefix);    break;
      case 'sk':        await runSkMessage(message, args, ctx, helpPrefix);    break;
      case 'ek':        await runEkMessage(message, args, ctx, helpPrefix);    break;
      case 'use':       await runUseMessage(message, args, ctx, helpPrefix);     break;
      case 'katalog':   await runKatalogMessage(message, args, helpPrefix, ctx);      break;
      case 'run':       await runRuneMessage(message, args, ctx, helpPrefix);         break;
      case 'dismantle': await runDismantleMessage(message, args, ctx, helpPrefix); break;
      case 'market':    await runMarketMessage(message, args, ctx, helpPrefix); break;
      case 'trade':     await runTradeMessage(message, args, ctx, helpPrefix); break;
      case 'pazar':     await runMarketSellerMessage(message, args, ctx, helpPrefix); break;
      case 'buy':       await runBuyMessage(message, args, ctx);                break;
      case 'sat':
        await runMarketSellMessage(message, args, ctx, helpPrefix);
        break;
      case 'msell':
        await runMarketSellMessage(message, args, ctx, helpPrefix, { legacyLabel: '`msell`' });
        break;
      case 'prestige':  await runPrestigeMessage(message, args, ctx, helpPrefix); break;
      case 'quest':
      case 'quests':  await runQuestsMessage(message, args, ctx, helpPrefix); break;
      case 'daily':     await runDailyLoginMessage(message, args, ctx, helpPrefix); break;
      case 'kumar':     await runKumarStatsMessage(message, args, ctx);             break;
      case 'kudos':     await runKudosMessage(message, args, ctx);                  break;
      case 'mentor':    await runMentorMessage(message, args, ctx);                 break;
      default: {
        if (isSocialActionCommand(sub)) {
          await runSocialActionMessage(message, args, ctx, sub, helpPrefix);
          break;
        }
        const suggestion = findClosest(sub, TEXT_SUBCOMMANDS);
        const typed = parts[0] ?? sub;
        await replyWithSuppression(
          message,
          { embeds: [buildUnknownCommandEmbed(helpPrefix, typed, suggestion)] },
          SuppressionKeys.usage('unknown', typed || 'empty'),
        );
      }
    }
    return sub;
  } finally {
    releaseInFlightAction(gate);
    await releaseRedisInFlight(ctx.redis, message.author.id, `prefix:${sub}`);
  }
}
