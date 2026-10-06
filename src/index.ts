import { PrismaClient } from '@prisma/client';
import { Client, Collection, Events, GatewayIntentBits, Options, Partials, Sweepers } from 'discord.js';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { CommandDefinition } from './types';
import { parseBotEnv, resolveDatabaseUrl, describeDatabaseUrl } from './env';
import { redis, assertRedisConnection } from './utils/redis';
import { getGuildPrefix } from './utils/prefix';
import { parsePrefixCommandLines } from './utils/prefix-command-lines';
import { BLOCKED_ENTERTAINMENT_BOT_IDS } from './config';
import { getOwlOnlyChannelIds } from './utils/owl-only-channels';
import { applyEntertainmentBotChannelBlocks } from './utils/owl-only-permissions';
import { handleOwlTextCommand } from './commands/owl';
import { resolveOwlSubcommand } from './commands/owl-utils';
import { handleTopTextCommand } from './commands/leaderboard';
import {
  handleRegistrationButton,
  handleOnboardingHintButton,
  handleOnboardingOpenButton,
  isOnboardingHintButton,
  isOnboardingOpenButton,
  isRegistrationButton,
} from './systems/onboarding';
import { handleMarketInteraction, isMarketCustomId } from './interactions/market';
import { handleTradeInteraction, isTradeCustomId } from './interactions/trade';
import { tryHandleCaptchaReply } from './anticheat/captcha-reply';
import { isGuildAdminCommand } from './utils/slash-admin';
import { syncAllRoles } from './systems/roles';
import { MAIN_GUILD_ID } from './config';
import {
  pruneExcessGuildsOnReady,
  registerGuildLifecycleHandlers,
} from './systems/guild-lifecycle';
import { isShard0 } from './utils/shard';
import { validateLaunchConfig } from './utils/launch-config';
import { collectOpsHealth } from './utils/ops-health';
import { getTotalGuildCount } from './systems/guild-lifecycle';
import { publishGuildCount } from './ops/ops-snapshot';
import { publishGuildDirectoryFromClient } from './ops/guild-directory';
import { scanBanKeys } from './utils/admin-access';
import { warmBanCacheFromKeys } from './utils/ban-cache';
import { initDbQueueProducer, setDbQueuePrisma } from './utils/db-queue';
import { consumeRoleSyncFlag } from './jobs/background-jobs';
import { processFeedbackAnnounceQueue } from './systems/feedback-announce';
import { announceBotOnline } from './systems/bot-online-announce';
import { processCompensationReminderQueue } from './systems/rebalance-compensation-reminder';
import { registerGracefulShutdown, trackInterval } from './utils/shutdown';
import {
  isPerfMetricsEnabled,
  logLocalPerfSummary,
  perfSummaryIntervalMs,
} from './utils/perf-metrics';
import { safeReply } from './utils/safe-reply';
import { notifyInteractionUserError, notifyPrefixUserError } from './utils/guarded-discord';
import {
  acquireInFlightAction,
  releaseInFlightAction,
  SuppressionKeys,
  sweepResponseSuppression,
} from './utils/response-suppression';
import { RUNTIME } from './config/runtime';
import {
  consumeDroppedTelemetryCount,
  flushCommandEvents,
  telemetryQueueSize,
} from './utils/command-telemetry';
import { logCommandError } from './utils/command-error';
import { executeCommandPipeline } from './middleware/command-pipeline';
import { acquireMessageProcessingLock, tryAcquireLocalMessageLock } from './middleware/message-dedup';
import {
  acquireGatewaySessionLock,
  releaseGatewaySessionLock,
  renewGatewaySessionLock,
} from './utils/gateway-singleton';
import {
  isExemptFromOwlOnlyChannel,
  isPrefixExemptFromOwlOnly,
} from './utils/owl-only-channels';
import {
  COOLDOWN_CLEAR_CHANNEL,
  handleCooldownClearSignal,
  purgeCooldownsAboveMax,
  sweepCooldownCache,
} from './middleware/cooldown-manager';
import { HUNT_COOLDOWN_MAX_REMAINING_MS } from './config';
import { stopAllCollectors, sweepExpiredCollectors } from './utils/collector-manager';
import { setDiscordClient } from './utils/discord-client-ref';
import { maybeAwardChatXp } from './systems/chat-xp';
import { hydrateApplicationEmojis } from './config/emoji-runtime';
import { refreshUiEmojis } from './config/ui-emojis';
import { refreshCoinSpinEmoji } from './utils/coinflip-ux';
import { allEmojiDefs } from './config/custom-emojis';

const env = parseBotEnv();

const dbUrl = resolveDatabaseUrl('bot');
const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
});
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
  // RAM optimizasyonu: discord.js varsayılan olarak tüm mesajları, üyeleri ve
  // kanalları bellekte tutar. Yüksek sunucu sayısında bu bellek sızıntısına yol açar.
  // makeCache: sadece ihtiyaç duyulan miktarı tut.
  makeCache: Options.cacheWithLimits({
    MessageManager: RUNTIME.discordCacheMessages,
    GuildMemberManager: RUNTIME.discordCacheMembers,
    UserManager: RUNTIME.discordCacheUsers,
    ReactionManager: 0, // Reaksiyon cache'i tamamen kapat (kullanılmıyor)
    GuildEmojiManager: 0, // Emoji cache'i kapat (kullanılmıyor)
    StageInstanceManager: 0,
    GuildStickerManager: 0,
  }),
  // sweepers: belirli aralıklarla eski cache girişlerini temizle
  sweepers: {
    messages: {
      interval: 300, // Her 5 dakikada bir tara
      lifetime: RUNTIME.discordMessageSweepLifetimeSec,
    },
    users: {
      interval: 3_600, // Her saatte bir tara
      filter: Sweepers.filterByLifetime({ lifetime: 3_600 }), // 1 saatten eski user objelerini sil
    },
    guildMembers: {
      interval: 3_600,
      filter: Sweepers.filterByLifetime({ lifetime: 3_600 }),
    },
  },
});
setDiscordClient(client);
const commandMap = new Collection<string, CommandDefinition>();
let cooldownSubscriber: typeof redis | null = null;

/**
 * src/commands altindaki komutlari dinamik yukler.
 */
async function loadCommands(): Promise<void> {
  const { fileURLToPath, pathToFileURL } = await import('node:url');
  // import.meta.dir Bun'a özgü; Node.js'de import.meta.url'den türet
  const currentDir =
    typeof (import.meta as any).dir !== 'undefined'
      ? ((import.meta as any).dir as string)
      : fileURLToPath(new URL('.', import.meta.url));
  const commandsDir = join(currentDir, 'commands');
  const files = await readdir(commandsDir);
  const commandFiles = files.filter(
    (name) => (name.endsWith('.ts') || name.endsWith('.js')) && !name.endsWith('.d.ts'),
  );

  for (const fileName of commandFiles) {
    // Windows'ta join() C:\... path üretir — ESM loader file:// ister
    const filePath = pathToFileURL(join(commandsDir, fileName)).href;
    const mod = (await import(filePath)) as {
      default?: CommandDefinition | { default?: CommandDefinition };
      extraCommands?: CommandDefinition[];
    };
    const raw = mod.default as any;
    const primary: CommandDefinition | undefined = raw?.data
      ? raw
      : raw?.default?.data
        ? raw.default
        : undefined;
    const toRegister: CommandDefinition[] = [];
    const seen = new Set<string>();
    const push = (cmd: CommandDefinition | undefined) => {
      const name = cmd?.data?.name;
      if (!name || seen.has(name)) return;
      seen.add(name);
      toRegister.push(cmd);
    };
    if (primary?.data?.name) push(primary);
    if (Array.isArray(mod.extraCommands)) {
      for (const extra of mod.extraCommands) {
        push(extra);
      }
    }
    for (const cmd of toRegister) {
      if (!isGuildAdminCommand(cmd.data.name)) continue;
      commandMap.set(cmd.data.name, cmd);
    }
  }
}

/**
 * Uygulama baglantilarini dogrular.
 */
async function logStartupDiagnostics(): Promise<void> {
  try {
    const report = await collectOpsHealth(redis, null);
    console.info(
      `[Startup] health=${report.status}/${report.legacyStatus} guilds=${report.checks.guilds.total}/${report.checks.guilds.maxGuilds} ` +
        `queue.waiting=${report.checks.queue.waiting} worker.ok=${report.checks.worker.ok}`,
    );
  } catch (err) {
    console.warn('[Startup] Diagnostics alinamadi:', err instanceof Error ? err.message : err);
  }
}

async function bootstrap(): Promise<void> {
  validateLaunchConfig();
  try {
    const { loaded, names } = await hydrateApplicationEmojis(env.DISCORD_TOKEN, env.CLIENT_ID);
    const live = new Set(names);
    const missing = allEmojiDefs()
      .map((d) => d.name)
      .filter((n, i, arr) => arr.indexOf(n) === i && !live.has(n));
    refreshUiEmojis();
    refreshCoinSpinEmoji();
    console.info(`[Emoji] Application hydrate: ${loaded} emoji`);
    if (missing.length > 0) {
      console.warn(
        `[Emoji] Registry’de var, Discord uygulamasında YOK (unicode fallback): ${missing.slice(0, 20).join(', ')}` +
          (missing.length > 20 ? ` (+${missing.length - 20})` : ''),
      );
    }
  } catch (err) {
    console.warn('[Emoji] Hydrate başarısız — statik ID / fallback:', err instanceof Error ? err.message : err);
  }
  await assertRedisConnection();
  console.info('Redis connected');
  cooldownSubscriber = redis.duplicate();
  await cooldownSubscriber.connect().catch(() => null);
  await cooldownSubscriber.subscribe(COOLDOWN_CLEAR_CHANNEL);
  cooldownSubscriber.on('message', (channel, key) => {
    if (channel !== COOLDOWN_CLEAR_CHANNEL) return;
    handleCooldownClearSignal(key);
  });

  if (isShard0()) {
    const purgedHuntCooldowns = await purgeCooldownsAboveMax(
      redis,
      'cooldown:hunt:*',
      HUNT_COOLDOWN_MAX_REMAINING_MS,
    );
    if (purgedHuntCooldowns > 0) {
      console.info(`[Cooldown] ${purgedHuntCooldowns} anormal hunt cooldown temizlendi`);
    }
  }

  await prisma.$connect();
  console.info(`PostgreSQL connected (${describeDatabaseUrl(dbUrl)})`);

  // DB kuyruk ureticisi — consumer ayri worker process'te
  setDbQueuePrisma(prisma);
  initDbQueueProducer();

  await loadCommands();

  registerGuildLifecycleHandlers(client);

  client.once(Events.ClientReady, (readyClient) => {
    console.info(`Bot baglandi: ${readyClient.user.tag}`);
    console.info(`Yuklu komut sayisi: ${commandMap.size}`);
    console.info(`Ana sunucu (admin slash): ${MAIN_GUILD_ID}`);
    if (isPerfMetricsEnabled()) {
      console.info('[Perf] Metrikler acik — ozet log + /admin sys perf');
      trackInterval(() => logLocalPerfSummary(), perfSummaryIntervalMs());
    }

    const publishGuilds = async () => {
      try {
        const directory = await publishGuildDirectoryFromClient(readyClient, redis);
        await publishGuildCount(redis, directory.total);
      } catch {
        /* optional */
      }
    };

    if (isShard0()) {
      void announceBotOnline(readyClient);
      void publishGuilds();
      trackInterval(() => void publishGuilds(), 5 * 60 * 1000);
      void pruneExcessGuildsOnReady(client).catch((err) => {
        console.error('[Guild] Startup prune hatasi:', err instanceof Error ? err.message : err);
      });
      void (async () => {
        try {
          const keys = await scanBanKeys(redis);
          const warmed = await warmBanCacheFromKeys(keys, (key) => redis.get(key));
          if (warmed > 0) {
            console.info(`[BanCache] Warmed ${warmed} entries from Redis`);
          }
        } catch (err) {
          console.warn('[BanCache] Warm-up atlandi:', err instanceof Error ? err.message : err);
        }
      })();
    }

    void logStartupDiagnostics();
  });

  // Prefix telemetry'i batch insert ile yaz (hot-path DB yazimini azaltir).
  trackInterval(async () => {
    await flushCommandEvents(prisma).catch(() => null);
    const dropped = consumeDroppedTelemetryCount();
    if (dropped > 0) {
      console.warn(`[Telemetry] Kuyruk tasmasi nedeniyle ${dropped} olay drop edildi`);
    }
  }, 5_000);

  // Yakalanmayan Discord client hatalarını logla, crash'e izin verme
  client.on('error', (error) => {
    console.error('[Client Error]', error);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (
      (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit())
      && isTradeCustomId(interaction.customId)
    ) {
      try {
        await handleTradeInteraction(interaction, { prisma, redis });
      } catch (error) {
        if ((error as { code?: number })?.code === 10062) return;
        if (await notifyInteractionUserError(interaction, error)) return;
        logCommandError('Trade Interaction Error', error);
      }
      return;
    }

    if (
      (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit())
      && isMarketCustomId(interaction.customId)
    ) {
      try {
        await handleMarketInteraction(interaction, { prisma, redis });
      } catch (error) {
        if ((error as { code?: number })?.code === 10062) return;
        if (await notifyInteractionUserError(interaction, error)) return;
        logCommandError('Market Interaction Error', error);
      }
      return;
    }

    if (interaction.isButton()) {
      if (isOnboardingHintButton(interaction.customId)) {
        try {
          await handleOnboardingHintButton(interaction);
        } catch (error) {
          if ((error as { code?: number })?.code === 10062) return;
          logCommandError('Onboarding Hint Error', error);
        }
        return;
      }
      if (isOnboardingOpenButton(interaction.customId)) {
        try {
          await handleOnboardingOpenButton(interaction, { prisma, redis });
        } catch (error) {
          if ((error as { code?: number })?.code === 10062) return;
          logCommandError('Onboarding Open Error', error);
        }
        return;
      }
      if (!isRegistrationButton(interaction.customId)) return;
      try {
        await handleRegistrationButton(interaction, { prisma, redis });
      } catch (error) {
        // Unknown interaction (10062) = token süresi dolmuş, sessizce geç
        if ((error as any)?.code === 10062) return;
        if (await notifyInteractionUserError(interaction, error)) return;
        logCommandError('Registration Button Error', error);
      }
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    const command = commandMap.get(interaction.commandName);
    if (!command) {
      if (interaction.isRepliable()) {
        try {
          await interaction.reply({
            content:
              '❌ Bu slash komutu bu shard üzerinde yüklü değil. Komutlar deploy edilmiş olabilir ama bot restart gerekebilir.',
            flags: 64,
          });
        } catch {
          /* token expired vb. */
        }
      }
      return;
    }

    const perfCommand = interaction.commandName;
    const flowCtx = { redis, command: perfCommand };
    await executeCommandPipeline({
      redis,
      prisma,
      userId: interaction.user.id,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      parentChannelId:
        interaction.channel?.isThread() === true ? interaction.channel.parentId : null,
      owlOnlyExempt: isExemptFromOwlOnlyChannel(perfCommand),
      displayName: interaction.user.displayName,
      command: perfCommand,
      source: 'slash',
      logLabel: 'Interaction Error',
      execute: () => command.execute(interaction, { prisma, redis }),
      notifyError: (error) => notifyInteractionUserError(interaction, error, { flowCtx }),
    });
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!tryAcquireLocalMessageLock(message.id)) return;
    if (!(await acquireMessageProcessingLock(redis, message.id))) return;

    try {
      const captchaHandled = await tryHandleCaptchaReply(message, { redis, prisma });
      if (captchaHandled) return;
    } catch (error) {
      logCommandError('Captcha Reply Error', error);
    }

    if (!message.guildId) return;
    const content = message.content.trim();
    if (!content) return;
    // Prefix komutu değilse (normal sohbet), mesaj bazlı XP ver.
    if (!/^[a-z0-9]/i.test(content)) {
      await maybeAwardChatXp(message, { prisma, redis }).catch(() => null);
      return;
    }

    const guildPrefix = await getGuildPrefix(redis, message.guildId);
    const commandLines = parsePrefixCommandLines(content, guildPrefix);
    if (commandLines === null) {
      await maybeAwardChatXp(message, { prisma, redis }).catch(() => null);
      return;
    }

    for (const commandText of commandLines) {
      if (!commandText) {
        await safeReply(message, '❌ **Komut eksik** | Ornek: owl yardim', {
          suppressionKey: SuppressionKeys.usage('empty'),
        });
        continue;
      }

      const parts = commandText.split(/\s+/).filter(Boolean);
      const firstWord = parts[0] ?? '';
      const pipelineCommand = resolveOwlSubcommand(firstWord);

      // Liderboard: owl top [kategori] veya owl lb [kategori]
      if (
        pipelineCommand === 'lb' ||
        firstWord === 'top' ||
        firstWord === 'lb' ||
        firstWord === 'liderboard' ||
        firstWord === 'leaderboard'
      ) {
        const topGate = {
          userId: message.author.id,
          guildId: message.guildId,
          key: SuppressionKeys.state('prefix:top-inflight'),
        };
        await executeCommandPipeline({
          redis,
          prisma,
          userId: message.author.id,
          guildId: message.guildId,
          channelId: message.channelId,
          parentChannelId: message.channel.isThread() ? message.channel.parentId : null,
          owlOnlyExempt: true,
          displayName: message.author.displayName,
          command: 'top',
          source: 'prefix',
          logLabel: 'Top Command Error',
          acquireGate: () => acquireInFlightAction(topGate),
          releaseGate: () => releaseInFlightAction(topGate),
          execute: () => handleTopTextCommand(message, parts.slice(1), { prisma, redis }),
          notifyError: (error) => notifyPrefixUserError(message, error),
        });
        continue;
      }

      let perfCommand = pipelineCommand;
      const prefixExempt = isPrefixExemptFromOwlOnly(firstWord);
      await executeCommandPipeline({
        redis,
        prisma,
        userId: message.author.id,
        guildId: message.guildId,
        channelId: message.channelId,
        parentChannelId: message.channel.isThread() ? message.channel.parentId : null,
        owlOnlyExempt: prefixExempt,
        displayName: message.author.displayName,
        command: () => perfCommand,
        source: 'prefix',
        logLabel: 'Message Command Error',
        execute: async () => {
          perfCommand = await handleOwlTextCommand(message, parts, { prisma, redis }, guildPrefix);
        },
        notifyError: (error) =>
          notifyPrefixUserError(message, error, { redis, command: perfCommand }),
      });
    }
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    if (!member.user.bot || !member.guild) return;
    if (!BLOCKED_ENTERTAINMENT_BOT_IDS.includes(member.id)) return;

    try {
      const channelIds = await getOwlOnlyChannelIds(redis, member.guild.id);
      for (const channelId of channelIds) {
        const channel = member.guild.channels.cache.get(channelId);
        if (channel?.isTextBased()) {
          await applyEntertainmentBotChannelBlocks(member.guild, channel, [member.id]);
        }
      }
    } catch (err) {
      console.warn('[OwlOnly] Yeni eğlence botu kanal izni uygulanamadı:', err);
    }
  });

  const shardId = parseInt(process.env.SHARD_ID ?? '0', 10) || 0;
  if (!(await acquireGatewaySessionLock(redis, shardId))) {
    console.error(
      `[Gateway] Shard #${shardId} icin baska bir bot instance aktif — pid ${process.pid} cikiyor.`,
    );
    process.exit(0);
  }
  trackInterval(() => void renewGatewaySessionLock(redis, shardId), 30_000);

  await client.login(env.DISCORD_TOKEN);
}

// Worker sezon rollover sonrasi rol sync istegi birakir — shard 0 isler
trackInterval(async () => {
  if (!isShard0()) return;
  const pending = await consumeRoleSyncFlag(redis);
  if (!pending) return;
  try {
    await syncAllRoles(client, MAIN_GUILD_ID, prisma, redis);
  } catch (err) {
    console.error('[Roles] Shard role sync hatasi:', err);
  }
}, 60_000);

trackInterval(async () => {
  if (!isShard0()) return;
  try {
    const n = await processFeedbackAnnounceQueue(client, redis, prisma);
    if (n > 0) {
      console.info(`[FeedbackAnnounce] ${n} duyuru gonderildi.`);
    }
  } catch (err) {
    console.error('[FeedbackAnnounce] Kuyruk isleme hatasi:', err);
  }
}, 15_000);

trackInterval(async () => {
  if (!isShard0()) return;
  try {
    const n = await processCompensationReminderQueue(client, redis, prisma);
    if (n > 0) {
      console.info(`[CompensationReminder] ${n} hatirlatma gonderildi.`);
    }
  } catch (err) {
    console.error('[CompensationReminder] Kuyruk isleme hatasi:', err);
  }
}, 30_000);

trackInterval(() => {
  sweepCooldownCache();
  sweepResponseSuppression();
  sweepExpiredCollectors();
}, 60_000);

registerGracefulShutdown(
  [
    () => {
      stopAllCollectors();
    },
    async () => {
      const shardId = parseInt(process.env.SHARD_ID ?? '0', 10) || 0;
      await releaseGatewaySessionLock(redis, shardId);
    },
    () => client.destroy(),
    async () => {
      await cooldownSubscriber?.quit().catch(() => null);
    },
    async () => {
      await flushCommandEvents(prisma).catch(() => null);
      const pending = telemetryQueueSize();
      if (pending > 0) {
        console.warn(`[Telemetry] Kapatma sonrasi kuyrukta kalan olay: ${pending}`);
      }
    },
    async () => {
      await redis.quit();
    },
    () => prisma.$disconnect(),
  ],
  'Bot',
);

void bootstrap().catch((err) => {
  console.error('[Bootstrap] Baslatma basarisiz:', err instanceof Error ? err.message : err);
  console.error('[Bootstrap] Redis/PostgreSQL kontrol: docker compose up -d postgres redis');
  process.exit(1);
});
