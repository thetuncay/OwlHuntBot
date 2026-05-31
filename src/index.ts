import { PrismaClient } from '@prisma/client';
import { Client, Collection, Events, GatewayIntentBits, Options, Sweepers } from 'discord.js';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { CommandDefinition } from './types';
import { parseBotEnv, resolveDatabaseUrl, describeDatabaseUrl } from './env';
import { redis, assertRedisConnection } from './utils/redis';
import { enforceAntiSpam } from './middleware/antiSpam';
import { acquireCommandSlot } from './middleware/load-shed';
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
  beginCommandPerf,
  isPerfMetricsEnabled,
  logLocalPerfSummary,
  perfSummaryIntervalMs,
} from './utils/perf-metrics';
import { safeReply } from './utils/safe-reply';
import { RUNTIME } from './config/runtime';
import {
  logCommandError,
  shouldNotifyUserOnDiscord,
  SpamBlockedError,
  userErrorMessage,
} from './utils/command-error';
import {
  COOLDOWN_CLEAR_CHANNEL,
  handleCooldownClearSignal,
  purgeCooldownsAboveMax,
  sweepCooldownCache,
} from './middleware/cooldown-manager';
import { HUNT_COOLDOWN_MAX_REMAINING_MS } from './config';

const env = parseBotEnv();

const dbUrl = resolveDatabaseUrl('bot');
const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
});
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  // RAM optimizasyonu: discord.js varsayılan olarak tüm mesajları, üyeleri ve
  // kanalları bellekte tutar. Yüksek sunucu sayısında bu bellek sızıntısına yol açar.
  // makeCache: sadece ihtiyaç duyulan miktarı tut.
  makeCache: Options.cacheWithLimits({
    MessageManager:     RUNTIME.discordCacheMessages,
    GuildMemberManager: RUNTIME.discordCacheMembers,
    UserManager:        RUNTIME.discordCacheUsers,
    ReactionManager:   0,    // Reaksiyon cache'i tamamen kapat (kullanılmıyor)
    GuildEmojiManager: 0,    // Emoji cache'i kapat (kullanılmıyor)
    StageInstanceManager: 0,
    GuildStickerManager: 0,
  }),
  // sweepers: belirli aralıklarla eski cache girişlerini temizle
  sweepers: {
    messages: {
      interval: 300,    // Her 5 dakikada bir tara
      lifetime: RUNTIME.discordMessageSweepLifetimeSec,
    },
    users: {
      interval: 3_600,  // Her saatte bir tara
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
  const currentDir = typeof (import.meta as any).dir !== 'undefined'
    ? (import.meta as any).dir as string
    : fileURLToPath(new URL('.', import.meta.url));
  const commandsDir = join(currentDir, 'commands');
  const files = await readdir(commandsDir);
  const commandFiles = files.filter((name) => (name.endsWith('.ts') || name.endsWith('.js')) && !name.endsWith('.d.ts'));

  for (const fileName of commandFiles) {
    // Windows'ta join() C:\... path üretir — ESM loader file:// ister
    const filePath = pathToFileURL(join(commandsDir, fileName)).href;
    const mod = (await import(filePath)) as { default?: CommandDefinition | { default?: CommandDefinition } };
    // CJS interop: TypeScript CJS çıktısında asıl export mod.default.default'ta olabilir
    const raw = mod.default as any;
    const cmd: CommandDefinition | undefined = raw?.data ? raw : raw?.default?.data ? raw.default : undefined;
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
        if (error instanceof SpamBlockedError) {
          if (!error.silent) {
            try {
              const payload = { content: error.message, flags: 64 as const };
              if (interaction.replied || interaction.deferred) {
                await interaction.followUp(payload);
              } else {
                await interaction.reply(payload);
              }
            } catch { /* ignore */ }
          }
          return;
        }
        if (shouldNotifyUserOnDiscord(error)) {
          const errorMsg = userErrorMessage(error);
          try {
            if (interaction.replied || interaction.deferred) {
              await interaction.followUp({ content: errorMsg, flags: 64 });
            } else {
              await interaction.reply({ content: errorMsg, flags: 64 });
            }
          } catch { /* ignore */ }
          return;
        }
        logCommandError('Registration Button Error', error);
      }
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    const command = commandMap.get(interaction.commandName);
    if (!command) return;

    let releaseSlot: (() => Promise<void>) | null = null;
    const perf = beginCommandPerf();
    const owlSub =
      interaction.commandName === 'owl'
        ? interaction.options.getSubcommand(false)
        : null;
    const perfCommand = owlSub ? `owl:${owlSub}` : interaction.commandName;
    let perfOk = true;
    let perfError: string | undefined;
    try {
      await enforceAntiSpam(redis, interaction.user.id, interaction.user.displayName);
      releaseSlot = await acquireCommandSlot(redis);
      perf.markQueueDone();
      await command.execute(interaction, { prisma, redis });
    } catch (error) {
      // Unknown interaction (10062) = token süresi dolmuş, sessizce geç
      if ((error as any)?.code === 10062) return;
      perfOk = false;
      perfError = error instanceof Error ? error.message : String(error);
      if (error instanceof SpamBlockedError) {
        if (!error.silent) {
          try {
            const payload = { content: error.message, flags: 64 as const };
            if (interaction.replied || interaction.deferred) {
              await interaction.followUp(payload);
            } else {
              await interaction.reply(payload);
            }
          } catch { /* ignore */ }
        }
        return;
      }
      if (shouldNotifyUserOnDiscord(error)) {
        const msg = userErrorMessage(error);
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: msg, flags: 64 });
          } else {
            await interaction.reply({ content: msg, flags: 64 });
          }
        } catch { /* ignore */ }
        return;
      }
      logCommandError('Interaction Error', error);
    } finally {
      await perf.finish(redis, {
        command: perfCommand,
        source: 'slash',
        ok: perfOk,
        error: perfError,
      }).catch(() => null);
      await releaseSlot?.().catch(() => null);
    }
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
    } else if (shortPrefix && lowered.startsWith(shortPrefix) && lowered.length > shortPrefix.length) {
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
      await safeReply(message, '❌ **Komut eksik** | Ornek: owl yardim');
      return;
    }

    const parts = commandText.split(/\s+/).filter(Boolean);
    const firstWord = (parts[0] ?? '').toLowerCase();

    // Liderboard: owl top [kategori] veya owl lb [kategori]
    if (firstWord === 'top' || firstWord === 'lb' || firstWord === 'liderboard' || firstWord === 'leaderboard') {
      let releaseSlot: (() => Promise<void>) | null = null;
      const perf = beginCommandPerf();
      let perfOk = true;
      let perfError: string | undefined;
      try {
        await enforceAntiSpam(redis, message.author.id, message.author.displayName);
        releaseSlot = await acquireCommandSlot(redis);
        perf.markQueueDone();
        await handleTopTextCommand(message, parts.slice(1), { prisma, redis });
      } catch (error) {
        perfOk = false;
        perfError = error instanceof Error ? error.message : String(error);
        if (error instanceof SpamBlockedError) {
          if (!error.silent) await safeReply(message, error.message);
          return;
        }
        if (shouldNotifyUserOnDiscord(error)) {
          await safeReply(message, userErrorMessage(error));
        } else {
          logCommandError('Top Command Error', error);
        }
      } finally {
        await perf.finish(redis, {
          command: 'top',
          source: 'prefix',
          ok: perfOk,
          error: perfError,
        }).catch(() => null);
        await releaseSlot?.().catch(() => null);
      }
      return;
    }

    let releaseSlot: (() => Promise<void>) | null = null;
    const perf = beginCommandPerf();
    let perfCommand = parts[0]?.toLowerCase() ?? 'owl';
    let perfOk = true;
    let perfError: string | undefined;
    try {
      await enforceAntiSpam(redis, message.author.id, message.author.displayName);
      releaseSlot = await acquireCommandSlot(redis);
      perf.markQueueDone();
      perfCommand = await handleOwlTextCommand(message, parts, { prisma, redis }, guildPrefix);
    } catch (error) {
      perfOk = false;
      perfError = error instanceof Error ? error.message : String(error);
      if (error instanceof SpamBlockedError) {
        if (!error.silent) await safeReply(message, error.message);
        return;
      }
      if (shouldNotifyUserOnDiscord(error)) {
        await safeReply(message, userErrorMessage(error));
      } else {
        logCommandError('Message Command Error', error);
      }
    } finally {
      await perf.finish(redis, {
        command: perfCommand,
        source: 'prefix',
        ok: perfOk,
        error: perfError,
      }).catch(() => null);
      await releaseSlot?.().catch(() => null);
    }
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
}, 60_000);

registerGracefulShutdown([
  () => client.destroy(),
  async () => { await cooldownSubscriber?.quit().catch(() => null); },
  async () => { await redis.quit(); },
  () => prisma.$disconnect(),
], 'Bot');

void bootstrap().catch((err) => {
  console.error('[Bootstrap] Baslatma basarisiz:', err instanceof Error ? err.message : err);
  console.error('[Bootstrap] Redis/PostgreSQL kontrol: docker compose up -d postgres redis');
  process.exit(1);
});
