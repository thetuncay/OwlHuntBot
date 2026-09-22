/** Discord düz metin mesaj üst sınırı. */
export const DISCORD_MAX_CONTENT_LENGTH = 2000;

/** Satırları 2000 karakter altında bir veya daha fazla mesaja böler. */
export function packDiscordLines(lines: string[], maxLen = DISCORD_MAX_CONTENT_LENGTH): string[] {
  const messages: string[] = [];
  let buf = '';

  const flush = (): void => {
    if (buf) {
      messages.push(buf);
      buf = '';
    }
  };

  for (const line of lines) {
    const addition = buf ? `\n${line}` : line;
    if (buf.length + addition.length > maxLen) {
      flush();
      if (line.length > maxLen) {
        throw new Error(`Discord satırı ${maxLen} karakterden uzun (${line.length})`);
      }
      buf = line;
    } else {
      buf += addition;
    }
  }

  flush();
  return messages.length > 0 ? messages : [''];
}
