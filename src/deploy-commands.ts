import { deployEnvSchema } from './env';
import { MAIN_GUILD_ID } from './config';
import { REST, Routes } from 'discord.js';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CommandDefinition } from './types';
import { isGuildAdminCommand } from './utils/slash-admin';

function resolveCommandModule(mod: {
  default?: CommandDefinition | { default?: CommandDefinition };
  extraCommands?: CommandDefinition[];
}): CommandDefinition[] {
  const raw = mod.default as CommandDefinition | { default?: CommandDefinition } | undefined;
  const cmd: CommandDefinition | undefined =
    raw && 'data' in raw && raw.data
      ? raw
      : raw && 'default' in raw && raw.default?.data
        ? raw.default
        : undefined;
  const out: CommandDefinition[] = [];
  const seen = new Set<string>();
  const push = (cmd: CommandDefinition | undefined) => {
    const name = cmd?.data?.name;
    if (!name || seen.has(name)) return;
    seen.add(name);
    out.push(cmd);
  };
  push(cmd);
  if (Array.isArray(mod.extraCommands)) {
    for (const extra of mod.extraCommands) {
      push(extra);
    }
  }
  return out;
}

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
  const loaded = (
    await Promise.all(
      commandFiles.map(async (fileName) => {
        const moduleUrl = pathToFileURL(join(commandsDir, fileName)).href;
        const mod = (await import(moduleUrl)) as {
          default?: CommandDefinition | { default?: CommandDefinition };
          extraCommands?: CommandDefinition[];
        };
        return resolveCommandModule(mod);
      }),
    )
  ).flat();
  return loaded.filter(
    (cmd) => typeof cmd.data?.toJSON === 'function' && isGuildAdminCommand(cmd.data.name),
  );
}

/**
 * Slash commandlarini Discord'a deploy eder.
 * Oyuncu slash yok — global liste temizlenir. Admin: guild-only (MAIN_GUILD_ID).
 */
export async function deployCommands(): Promise<void> {
  const env = deployEnvSchema.parse(process.env);
  const adminCommands = await loadCommands();
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

  await rest.put(Routes.applicationCommands(env.CLIENT_ID), { body: [] });
  console.info('Global komutlar temizlendi (0 oyuncu slash)');

  if (adminCommands.length > 0) {
    await rest.put(Routes.applicationGuildCommands(env.CLIENT_ID, MAIN_GUILD_ID), {
      body: adminCommands.map((command) => command.data.toJSON()),
    });
    console.info(
      `Admin komutlari guild-only deploy edildi: ${adminCommands.length} adet (guild ${MAIN_GUILD_ID})`,
    );
  }
}

void deployCommands();
