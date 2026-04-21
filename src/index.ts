import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { CommandDefinition } from './types';
import { redis, assertRedisConnection } from './utils/redis';
import { enforceAntiSpam } from './middleware/antiSpam';
import { getGuildPrefix } from './utils/prefix';
import { handleOwlTextCommand } from './commands/owl';
import { handleRegistrationButton, isRegistrationButton } from './systems/onboarding';
import { getLeaderboard, archiveAndResetSeason, currentSeasonId, seasonEndDate } from './systems/leaderboard';
import { syncAllRoles } from './systems/roles';
import { handleTopTextCommand } from './commands/leaderboard';
import type { LeaderboardCategory } from './systems/leaderboard';

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  CLIENT_ID: z.string().min(1),
  GUILD_ID: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  NODE_ENV: z.string().min(1),
});

const env = envSchema.parse(process.env);
const prisma = new PrismaClient();
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});
const commandMap = new Collection<string, CommandDefinition>();

/**
 * src/commands altindaki komutlari dinamik yukler.
 */
async function loadCommands(): Promise<void> {
  const distDir = join(process.cwd(), 'dist', 'commands');
  const srcDir = join(process.cwd(), 'src', 'commands');
  let commandsDir: string;
  try {
    await access(distDir);
    commandsDir = distDir;
  } catch {
    commandsDir = srcDir;
  }
  const files = await readdir(commandsDir);
  const commandFiles = files.filter((name) => (name.endsWith('.ts') || name.endsWith('.js')) && !name.endsWith('.d.ts'));

  for (const fileName of commandFiles) {
    const moduleUrl = pathToFileURL(join(commandsDir, fileName)).href;
    const mod = (await import(moduleUrl)) as { default?: CommandDefinition };
    if (mod.default?.data?.name) {
      commandMap.set(mod.default.data.name, mod.default);
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
  console.info('MongoDB connected');
  await loadCommands();

  client.once(Events.ClientReady, (readyClient) => {
    console.info(`Bot baglandi: ${readyClient.user.tag}`);
    console.info(`Yuklu komut sayisi: ${commandMap.size}`);
    console.info(`Guild: ${env.GUILD_ID}`);
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

    try {
      await enforceAntiSpam(redis, interaction.user.id);
      await command.execute(interaction, { prisma, redis });
    } catch (error) {
      // Unknown interaction (10062) = token süresi dolmuş, sessizce geç
      if ((error as any)?.code === 10062) return;
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
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guildId) return;
    const content = message.content.trim();
    if (!content) return;

    const guildPrefix = await getGuildPrefix(redis, message.guildId);
    const lowered = content.toLowerCase();
    const defaultPrefix = 'owl ';
    const customPrefix = `${guildPrefix} `;
    // Boşluksuz kısaltma: "wh" → "w h", "wc" → "w c" vb.
    // Prefix tek harf veya kısa kelimeyse boşluksuz kullanım da desteklenir
    const shortPrefix = guildPrefix.length <= 3 ? guildPrefix : null;
    let commandText: string;

    if (lowered.startsWith(defaultPrefix)) {
      commandText = content.slice(defaultPrefix.length).trim();
    } else if (lowered.startsWith(customPrefix)) {
      commandText = content.slice(customPrefix.length).trim();
    } else if (shortPrefix && lowered.startsWith(shortPrefix) && lowered.length > shortPrefix.length) {
      // Boşluksuz: "wh" → commandText = "h", "wbj" → "bj 100" değil sadece "bj"
      // Sadece tek karakter kısaltmalar için çalışır: wh, ws, wc, wd, wz vb.
      const afterPrefix = content.slice(shortPrefix.length).trim();
      if (afterPrefix.length > 0) {
        commandText = afterPrefix;
      } else {
        return;
      }
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
      try {
        await enforceAntiSpam(redis, message.author.id);
        await handleTopTextCommand(message, parts.slice(1), { prisma, redis });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Bir hata olustu.';
        await message.reply(`❌ ${msg}`);
      }
      return;
    }

    try {
      await enforceAntiSpam(redis, message.author.id);
      await handleOwlTextCommand(message, parts, { prisma, redis });
    } catch (error) {
      console.error('[Message Command Error]', error);
      const errorMsg = error instanceof Error ? error.message : 'Bir seyler ters gitti, islem geri alindi.';
      await message.reply(`❌ **Hata** | ${errorMsg}`);
    }
  });

  await client.login(env.DISCORD_TOKEN);
}

// --- SEZON ZAMANLAYICI ---

/**
 * Sezon bitis tarihini kontrol eder ve gerekirse arsivler.
 * Her saat basinda calisir.
 */
async function checkSeasonRollover(): Promise<void> {
  try {
    const season = await prisma.season.findUnique({ where: { id: 'current' } });
    const now = new Date();

    if (!season || now >= season.endsAt) {
      const archivedId = await archiveAndResetSeason(prisma, redis);
      console.info(`[Season] Sezon tamamlandi ve arsivlendi: ${archivedId}`);

      // Rolleri senkronize et
      await syncAllRoles(client, env.GUILD_ID, prisma, redis);
    }
  } catch (err) {
    console.error('[Season] Rollover hatasi:', err);
  }
}

// Her saat basinda sezon kontrolu
setInterval(() => { void checkSeasonRollover(); }, 60 * 60 * 1000);
// Baslangicta da kontrol et
setTimeout(() => { void checkSeasonRollover(); }, 5000);

async function shutdown() {
  console.info('Bot kapatiliyor...');
  await client.destroy();
  await redis.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

void bootstrap();
