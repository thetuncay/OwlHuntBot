import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { z } from 'zod';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CommandDefinition } from './types';

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  CLIENT_ID: z.string().min(1),
  GUILD_ID: z.string().min(1),
});

async function loadCommands(): Promise<CommandDefinition[]> {
  const distDir = join(process.cwd(), 'dist', 'commands');
  const srcDir  = join(process.cwd(), 'src', 'commands');
  let commandsDir: string;
  try {
    const { access } = await import('node:fs/promises');
    await access(distDir);
    commandsDir = distDir;
  } catch {
    commandsDir = srcDir;
  }
  const files = await readdir(commandsDir);
  const commandFiles = files.filter((name) => (name.endsWith('.ts') || name.endsWith('.js')) && !name.endsWith('.d.ts'));
  const loaded = await Promise.all(
    commandFiles.map(async (fileName) => {
      const moduleUrl = pathToFileURL(join(commandsDir, fileName)).href;
      const mod = (await import(moduleUrl)) as { default?: CommandDefinition | { default?: CommandDefinition } };
      // CJS interop: TypeScript CJS çıktısında asıl export mod.default.default'ta olabilir
      const raw = mod.default as any;
      const cmd: CommandDefinition | undefined = raw?.data ? raw : raw?.default?.data ? raw.default : undefined;
      return cmd;
    }),
  );
  // default export'u olmayan yardımcı dosyaları filtrele
  return loaded.filter((cmd): cmd is CommandDefinition => cmd !== undefined && typeof cmd.data?.toJSON === 'function');
}

/**
 * Slash commandlarini Discord'a deploy eder.
 */
export async function deployCommands(): Promise<void> {
  const env = envSchema.parse(process.env);
  const commands = await loadCommands();
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(env.CLIENT_ID), {
    body: commands.map((command) => command.data.toJSON()),
  });
  console.info(`Komutlar deploy edildi: ${commands.length} adet`);
}

void deployCommands();
