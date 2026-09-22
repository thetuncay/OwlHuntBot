import { resolvePrefixCommandText } from './alias-command';

/**
 * Prefix mesajindan calistirilacak komut metinlerini cikarir.
 * Cok satirli mesajlarda her satir ayri komut olarak islenir (OwO tarzi).
 */
export function parsePrefixCommandLines(content: string, guildPrefix: string): string[] | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean);

  if (lines.length <= 1) {
    const commandText = resolvePrefixCommandText(trimmed, guildPrefix);
    if (commandText === null) return null;
    return [commandText];
  }

  const commands: string[] = [];
  for (const line of lines) {
    const commandText = resolvePrefixCommandText(line, guildPrefix);
    if (commandText === null) continue;
    commands.push(commandText);
  }

  if (commands.length > 0) return commands;

  const fallback = resolvePrefixCommandText(trimmed, guildPrefix);
  if (fallback === null) return null;
  return [fallback];
}
