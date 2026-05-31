/** Discord relative timestamp — client-side geri sayim (<t:unix:R>). */
export function discordRelativeTimestamp(secondsFromNow: number): string {
  const unix = Math.floor(Date.now() / 1000) + Math.max(1, Math.ceil(secondsFromNow));
  return `<t:${unix}:R>`;
}
