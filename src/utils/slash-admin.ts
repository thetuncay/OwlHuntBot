const ADMIN_COMMAND_NAME = 'admin';

/** Bot admin slash komutlari — guild-only deploy ve runtime handler filtresi. */
export function isGuildAdminCommand(name: string): boolean {
  return (
    name === ADMIN_COMMAND_NAME ||
    name.startsWith('admin-') ||
    name === 'anticheat' ||
    name === 'appeal'
  );
}
