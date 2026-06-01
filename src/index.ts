import { PrismaClient } from '@prisma/client';
import { Client, Collection, Events, GatewayIntentBits, Options, Sweepers } from 'discord.js';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { CommandDefinition } from './types';
import { parseBotEnv, resolveDatabaseUrl, describeDatabaseUrl } from './env';
import { redis, assertRedisConnection } from './utils/redis';
import { getGuildPrefix } from './utils/prefix';
import { stripGluedPrefix } from './utils/owo-command';
import { handleOwlTextCommand } from './commands/owl';
import { handleTopTextCommand } from './commands/leaderboard';
import { handleRegistrationButton, isRegistrationButton } from './systems/onboarding';
import { syncAllRoles } from './systems/roles';
import { isShard0 } from './utils/shard';
import { initDbQueueProducer, setDbQueuePrisma } from './utils/db-queue';
import { consumeRoleSyncFlag } from './jobs/background-jobs';
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
import {
  COOLDOWN_CLEAR_CHANNEL,
  handleCooldownClearSignal,
  purgeCooldownsAboveMax,
  sweepCooldownCache,
} from './middleware/cooldown-manager';
import { HUNT_COOLDOWN_MAX_REMAINING_MS } from './config';
import { stopAllCollectors, sweepExpiredCollectors } from './utils/collector-manager';

const env = parseBotEnv();

const dbUrl = resolveDatabaseUrl('bot');
const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
});
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
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
    };
    // CJS interop: TypeScript CJS çıktısında asıl export mod.default.default'ta olabilir
    const raw = mod.default as any;
    const cmd: CommandDefinition | undefined = raw?.data
      ? raw
      : raw?.default?.data
        ? raw.default
        : undefined;
    if (cmd?.data?.name) {
      commandMap.set(cmd.data.name, cmd);
    }
  }
}

/**
 * Uygulama baglantilarini dogrular.
 */
async function bootstrap(): Promise<void> {
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

  client.once(Events.ClientReady, (readyClient) => {
    console.info(`Bot baglandi: ${readyClient.user.tag}`);
    console.info(`Yuklu komut sayisi: ${commandMap.size}`);
    console.info(`Guild: ${env.GUILD_ID}`);
    if (isPerfMetricsEnabled()) {
      console.info('[Perf] Metrikler acik — ozet log + /admin sys perf');
      trackInterval(() => logLocalPerfSummary(), perfSummaryIntervalMs());
    }
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
    if (interaction.isButton()) {
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
    if (!command) return;

    const owlSub =
      interaction.commandName === 'owl' ? interaction.options.getSubcommand(false) : null;
    const perfCommand = owlSub ? `owl:${owlSub}` : interaction.commandName;
    const actionGate = {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      key: SuppressionKeys.state(`interaction:${perfCommand}`),
      ttlMs: 20_000,
    };
    await executeCommandPipeline({
      redis,
      userId: interaction.user.id,
      displayName: interaction.user.displayName,
      command: perfCommand,
      source: 'slash',
      logLabel: 'Interaction Error',
      acquireGate: () => acquireInFlightAction(actionGate),
      releaseGate: () => releaseInFlightAction(actionGate),
      execute: () => command.execute(interaction, { prisma, redis }),
      notifyError: (error) => notifyInteractionUserError(interaction, error),
    });
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guildId) return;
    const content = message.content.trim();
    if (!content) return;
    // Prefix sadece alfanumerik oldugu icin bu filtre Redis get'i azaltir.
    if (!/^[a-z0-9]/i.test(content)) return;

    const guildPrefix = await getGuildPrefix(redis, message.guildId);
    const glued = stripGluedPrefix(content, guildPrefix);
    const lowered = glued.toLowerCase();
    const defaultPrefix = 'owl ';
    const customPrefix = `${guildPrefix} `;
    const shortPrefix = guildPrefix.length <= 3 ? guildPrefix : null;
    let commandText: string;

    if (lowered.startsWith(defaultPrefix)) {
      commandText = glued.slice(defaultPrefix.length).trim();
    } else if (lowered.startsWith(customPrefix)) {
      commandText = glued.slice(customPrefix.length).trim();
    } else if (
      shortPrefix &&
      lowered.startsWith(shortPrefix) &&
      lowered.length > shortPrefix.length
    ) {
      const afterPrefix = glued.slice(shortPrefix.length).trim();
      if (afterPrefix.length > 0) {
        commandText = afterPrefix;
      } else {
        return;
      }
    } else if (glued !== content) {
      // stripGluedPrefix zaten wh/wdaily → h/daily ayırdı
      commandText = glued;
    } else {
      return;
    }

    if (!commandText) {
      await safeReply(message, '❌ **Komut eksik** | Ornek: owl yardim', {
        suppressionKey: SuppressionKeys.usage('empty'),
      });
      return;
    }

    const parts = commandText.split(/\s+/).filter(Boolean);
    const firstWord = (parts[0] ?? '').toLowerCase();

    // Liderboard: owl top [kategori] veya owl lb [kategori]
    if (
      firstWord === 'top' ||
      firstWord === 'lb' ||
      firstWord === 'liderboard' ||
      firstWord === 'leaderboard'
    ) {
      const topGate = {
        userId: message.author.id,
        guildId: message.guildId,
        key: SuppressionKeys.state('prefix:top-inflight'),
        ttlMs: 15_000,
      };
      await executeCommandPipeline({
        redis,
        userId: message.author.id,
        displayName: message.author.displayName,
        command: 'top',
        source: 'prefix',
        logLabel: 'Top Command Error',
        acquireGate: () => acquireInFlightAction(topGate),
        releaseGate: () => releaseInFlightAction(topGate),
        execute: () => handleTopTextCommand(message, parts.slice(1), { prisma, redis }),
        notifyError: (error) => notifyPrefixUserError(message, error),
      });
      return;
    }

    let perfCommand = parts[0]?.toLowerCase() ?? 'owl';
    await executeCommandPipeline({
      redis,
      userId: message.author.id,
      displayName: message.author.displayName,
      command: () => perfCommand,
      source: 'prefix',
      logLabel: 'Message Command Error',
      execute: async () => {
        perfCommand = await handleOwlTextCommand(message, parts, { prisma, redis }, guildPrefix);
      },
      notifyError: (error) => notifyPrefixUserError(message, error),
    });
  });

  await client.login(env.DISCORD_TOKEN);
}

// Worker sezon rollover sonrasi rol sync istegi birakir — shard 0 isler
trackInterval(async () => {
  if (!isShard0()) return;
  const pending = await consumeRoleSyncFlag(redis);
  if (!pending) return;
  try {
    await syncAllRoles(client, env.GUILD_ID, prisma, redis);
  } catch (err) {
    console.error('[Roles] Shard role sync hatasi:', err);
  }
}, 60_000);

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
