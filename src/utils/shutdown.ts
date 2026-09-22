/**
 * Graceful shutdown yardimcilari — SIGINT, SIGTERM, uncaughtException, unhandledRejection.
 */

const SHUTDOWN_TIMEOUT_MS = 30_000;

export type ShutdownTask = () => void | Promise<void>;

let isShuttingDown = false;
const intervalIds = new Set<NodeJS.Timeout>();
const timeoutIds = new Set<NodeJS.Timeout>();

export function trackInterval(fn: () => void, ms: number): NodeJS.Timeout {
  const id = setInterval(fn, ms);
  intervalIds.add(id);
  return id;
}

export function trackTimeout(fn: () => void, ms: number): NodeJS.Timeout {
  const id = setTimeout(fn, ms);
  timeoutIds.add(id);
  return id;
}

/** PM2 restart / shard.kill sırasında discord.js IPC kapanınca oluşur — zararsız. */
export function isBenignShutdownError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string };
  return e.code === 'ERR_IPC_CHANNEL_CLOSED'
    || (typeof e.message === 'string' && e.message.includes('Channel closed'));
}

export function registerGracefulShutdown(tasks: ShutdownTask[], label = 'App'): void {
  const run = (signal: string) => {
    void shutdown(tasks, `${label}:${signal}`);
  };

  process.on('SIGTERM', () => run('SIGTERM'));
  process.on('SIGINT', () => run('SIGINT'));
  process.on('uncaughtException', (error) => {
    if (isBenignShutdownError(error)) {
      console.warn(`[${label}] IPC kanali kapandi (shutdown/restart — beklenen).`);
      return;
    }
    console.error(`[${label}] uncaughtException:`, error);
    run('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    if (isBenignShutdownError(reason)) {
      console.warn(`[${label}] IPC rejection (shutdown/restart — beklenen).`);
      return;
    }
    console.error(`[${label}] unhandledRejection:`, reason);
    run('unhandledRejection');
  });
}

async function shutdown(tasks: ShutdownTask[], reason: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.info(`[Shutdown] Kapatiliyor (${reason})...`);

  for (const id of intervalIds) clearInterval(id);
  for (const id of timeoutIds) clearTimeout(id);
  intervalIds.clear();
  timeoutIds.clear();

  const forceExit = setTimeout(() => {
    console.error('[Shutdown] Zaman asimi — zorla cikiliyor.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  for (const task of tasks) {
    try {
      await task();
    } catch (error) {
      console.error('[Shutdown] Gorev hatasi:', error);
    }
  }

  clearTimeout(forceExit);
  process.exit(0);
}
