import { deployEnvSchema } from './env';
import { REST, Routes } from 'discord.js';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CommandDefinition } from './types';

async function loadCommands(): Promise<CommandDefinition[]> {
  const distDir = join(process.cwd(), 'dist', 'commands');
  const srcDir = join(process.cwd(), 'src', 'commands');
  let commandsDir: string;
  try {
    const { access } = await import('node:fs/promises');
    await access(distDir);
    commandsDir = distDir;
  } catch {
    commandsDir = srcDir;
  }
  const files = await readdir(commandsDir);
  const commandFiles = files.filter(
    (name) => (name.endsWith('.ts') || name.endsWith('.js')) && !name.endsWith('.d.ts'),
  );
  const loaded = await Promise.all(
    commandFiles.map(async (fileName) => {
      const moduleUrl = pathToFileURL(join(commandsDir, fileName)).href;
      const mod = (await import(moduleUrl)) as {
        default?: CommandDefinition | { default?: CommandDefinition };
      };
      const raw = mod.default as CommandDefinition | { default?: CommandDefinition } | undefined;
      const cmd: CommandDefinition | undefined =
        raw && 'data' in raw && raw.data
          ? raw
          : raw && 'default' in raw && raw.default?.data
            ? raw.default
            : undefined;
      return cmd;
    }),
  );
  return loaded.filter(
    (cmd): cmd is CommandDefinition =>
      cmd !== undefined && typeof cmd.data?.toJSON === 'function',
  );
}

/**
 * Slash commandlarini Discord'a deploy eder.
 */
export async function deployCommands(): Promise<void> {
  const env = deployEnvSchema.parse(process.env);
  const commands = await loadCommands();
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(env.CLIENT_ID), {
    body: commands.map((command) => command.data.toJSON()),
  });
  console.info(`Komutlar deploy edildi: ${commands.length} adet`);
}

void deployCommands();
