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
import { initDbQueueProducer } from './utils/db-queue';
import { consumeRoleSyncFlag } from './jobs/background-jobs';
import { registerGracefulShutdown, trackInterval } from './utils/shutdown';
import {
  beginCommandPerf,
  isPerfMetricsEnabled,
  logLocalPerfSummary,
  perfSummaryIntervalMs,
} from './utils/perf-metrics';

const env = parseBotEnv();

/** Kullaniciya gosterilen beklenen hatalar — PM2 logunu kirletmez. */
function isExpectedUserError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  return (
    msg.includes('hizli komut') ||
    msg.includes('Spam algilandi') ||
    msg.includes('yoğun') ||
    msg.includes('beklemelisin') ||
    msg.includes('Tekrar avlanmak')
  );
}

function formatUserFacingError(error: unknown): string {
  if (!(error instanceof Error)) return 'Bir seyler ters gitti, islem geri alindi.';
  if (error.message.includes('Received one or more errors')) {
    return 'Bot mesaji Discord sinirini asti. Yonetici deploy guncellemesi gerekebilir.';
  }
  return error.message;
}

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
    MessageManager:    50,   // Kanal başına max 50 mesaj (varsayılan: sınırsız)
    GuildMemberManager: 200, // Guild başına max 200 üye (komutlar user ID ile çalışır, üye listesi gerekmez)
    UserManager:       500,  // Global max 500 kullanıcı objesi
    ReactionManager:   0,    // Reaksiyon cache'i tamamen kapat (kullanılmıyor)
    GuildEmojiManager: 0,    // Emoji cache'i kapat (kullanılmıyor)
    StageInstanceManager: 0,
    GuildStickerManager: 0,
  }),
  // sweepers: belirli aralıklarla eski cache girişlerini temizle
  sweepers: {
    messages: {
      interval: 300,    // Her 5 dakikada bir tara
      lifetime: 600,    // 10 dakikadan eski mesajları sil
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
  await prisma.$connect();
  console.info(`PostgreSQL connected (${describeDatabaseUrl(dbUrl)})`);

  // DB kuyruk ureticisi — consumer ayri worker process'te
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
        console.error('[Registration Button Error]', error);
        const errorMsg = error instanceof Error ? error.message : 'Kayit isleminde bir hata olustu.';
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: `❌ **Hata** | ${errorMsg}`, flags: 64 });
          } else {
            await interaction.reply({ content: `❌ **Hata** | ${errorMsg}`, flags: 64 });
          }
        } catch {
          // Yanıt gönderilemedi, sessizce geç
        }
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
      releaseSlot = await acquireCommandSlot(redis);
      await enforceAntiSpam(redis, interaction.user.id);
      perf.markQueueDone();
      await command.execute(interaction, { prisma, redis });
    } catch (error) {
      // Unknown interaction (10062) = token süresi dolmuş, sessizce geç
      if ((error as any)?.code === 10062) return;
      perfOk = false;
      perfError = error instanceof Error ? error.message : String(error);
      console.error('[Interaction Error]', error);
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: 'Bir seyler ters gitti, islem geri alindi.',
            flags: 64,
          });
        } else {
          await interaction.reply({
            content: 'Bir seyler ters gitti, islem geri alindi.',
            flags: 64,
          });
        }
      } catch {
        // Yanıt gönderilemedi, sessizce geç
      }
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
      await message.reply('❌ **Komut eksik** | Ornek: owl yardim');
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
        releaseSlot = await acquireCommandSlot(redis);
        await enforceAntiSpam(redis, message.author.id);
        perf.markQueueDone();
        await handleTopTextCommand(message, parts.slice(1), { prisma, redis });
      } catch (error) {
        perfOk = false;
        perfError = error instanceof Error ? error.message : String(error);
        const msg = error instanceof Error ? error.message : 'Bir hata olustu.';
        await message.reply(`❌ ${msg}`);
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
      releaseSlot = await acquireCommandSlot(redis);
      await enforceAntiSpam(redis, message.author.id);
      perf.markQueueDone();
      perfCommand = await handleOwlTextCommand(message, parts, { prisma, redis });
    } catch (error) {
      perfOk = false;
      perfError = error instanceof Error ? error.message : String(error);
      if (!isExpectedUserError(error)) {
        console.error('[Message Command Error]', error);
      }
      const errorMsg = formatUserFacingError(error);
      await message.reply(`❌ **Hata** | ${errorMsg}`);
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

registerGracefulShutdown([
  () => client.destroy(),
  async () => { await redis.quit(); },
  () => prisma.$disconnect(),
], 'Bot');

void bootstrap().catch((err) => {
  console.error('[Bootstrap] Baslatma basarisiz:', err instanceof Error ? err.message : err);
  console.error('[Bootstrap] Redis/PostgreSQL kontrol: docker compose up -d postgres redis');
  process.exit(1);
});
