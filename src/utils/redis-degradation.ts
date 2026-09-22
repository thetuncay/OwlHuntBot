/**
 * Redis gate degradation policy:
 *
 * Non-critical gates (rate limit, cooldown, anti-spam) **fail-open** when Redis is unavailable.
 *
 * Security-sensitive checks (ban/maintenance) in `assertCommandAccess` **fail-closed**
 * for non-admins (ban memory cache + maintenance assumed on when Redis is down).
 */

export function warnRedisDegradation(context: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(`[Redis] ${context} degraded:`, msg);
}
