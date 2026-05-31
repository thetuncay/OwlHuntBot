/**
 * OwO stili canli geri sayim — Discord client <t:unix:R> gunceller, bot edit yapmaz.
 * @param remainingMs Redis PTTL'den gelen kalan sure (ms)
 */
export function discordCountdownFromRemainingMs(remainingMs: number): string {
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
  const unix = Math.floor(Date.now() / 1000) + seconds;
  return `<t:${unix}:R>`;
}

/** Discord relative timestamp — simdi + N saniye (<t:unix:R>). */
export function discordRelativeTimestamp(secondsFromNow: number): string {
  const seconds = Math.max(1, Math.ceil(secondsFromNow));
  const unix = Math.floor(Date.now() / 1000) + seconds;
  return `<t:${unix}:R>`;
}
