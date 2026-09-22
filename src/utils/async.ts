/**
 * Ortak async yardimcilari.
 */

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fire-and-forget islemleri tek tip loglama ile calistir.
 */
export function runDetached<T>(
  label: string,
  task: () => Promise<T>,
): void {
  void task().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Detached] ${label}:`, msg);
  });
}
