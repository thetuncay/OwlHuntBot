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
  const commandsDir = join(process.cwd(), 'src', 'commands');
  const files = await readdir(commandsDir);
  const commandFiles = files.filter((name) => name.endsWith('.ts'));
  const loaded = await Promise.all(
    commandFiles.map(async (fileName) => {
      const moduleUrl = pathToFileURL(join(commandsDir, fileName)).href;
      const mod = (await import(moduleUrl)) as { default: CommandDefinition };
      return mod.default;
    }),
  );
  return loaded;
}

/**
 * Slash commandlarini Discord'a deploy eder.
 */
export async function deployCommands(): Promise<void> {
  const env = envSchema.parse(process.env);
  const commands = await loadCommands();
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(env.CLIENT_ID, env.GUILD_ID), {
    body: commands.map((command) => command.data.toJSON()),
  });
  console.info(`Komutlar deploy edildi: ${commands.length} adet`);
}

void deployCommands();
