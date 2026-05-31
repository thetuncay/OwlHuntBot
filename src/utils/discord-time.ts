/** Discord relative timestamp — mutlak unix saniye (<t:unix:R>). */
export function discordTimestampFromMs(expiresAtMs: number): string {
  const unix = Math.max(
    Math.floor(Date.now() / 1000) + 1,
    Math.ceil(expiresAtMs / 1000),
  );
  return `<t:${unix}:R>`;
}

/** Discord relative timestamp — simdi + N saniye (<t:unix:R>). */
export function discordRelativeTimestamp(secondsFromNow: number): string {
  const safeSeconds = Math.max(1, Math.ceil(secondsFromNow));
  return discordTimestampFromMs(Date.now() + safeSeconds * 1000);
}
