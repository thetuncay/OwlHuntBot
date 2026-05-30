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

export function registerGracefulShutdown(tasks: ShutdownTask[], label = 'App'): void {
  const run = (signal: string) => {
    void shutdown(tasks, `${label}:${signal}`);
  };

  process.on('SIGTERM', () => run('SIGTERM'));
  process.on('SIGINT', () => run('SIGINT'));
  process.on('uncaughtException', (error) => {
    console.error(`[${label}] uncaughtException:`, error);
    run('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
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
