/**
 * Public landing page config (no secrets).
 */
import type { Redis } from 'ioredis';
import { OPS_GUILD_COUNT_KEY } from './ops-config';

const DEFAULT_PERMISSIONS = '4504115023833104';

export interface PublicSiteConfig {
  botName: string;
  tagline: string;
  /** Site route — login gerekir, sonra bot invite. */
  inviteUrl: string;
  /** Discord bot authorize URL (API/debug; butonlar /invite kullanir). */
  discordInviteUrl: string | null;
  discordLoginUrl: string;
  guildCount: number | null;
  maxGuilds: number;
  supportUrl: string | null;
}

function invitePermissions(): string {
  return process.env.DISCORD_INVITE_PERMISSIONS?.trim() || DEFAULT_PERMISSIONS;
}

export function buildDiscordInviteUrl(clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: invitePermissions(),
    integration_type: '0',
    scope: 'bot',
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export async function resolvePublicSiteConfig(redis: Redis): Promise<PublicSiteConfig> {
  const clientId = process.env.CLIENT_ID?.trim() ?? '';
  const maxGuilds = Number.parseInt(process.env.MAX_GUILDS ?? '100', 10);
  let guildCount: number | null = null;

  try {
    const raw = await redis.get(OPS_GUILD_COUNT_KEY);
    if (raw) {
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n)) guildCount = n;
    }
  } catch {
    /* optional */
  }

  const supportUrl =
    process.env.SUPPORT_SERVER_URL?.trim() || 'https://discord.gg/5yQxgQDRHu';

  return {
    botName: process.env.PUBLIC_BOT_NAME?.trim() || 'OwlHuntBot',
    tagline: process.env.PUBLIC_BOT_TAGLINE?.trim()
      || 'Sunucunu avlanma, evcilleştirme ve liderlik tablolarıyla doldur.',
    inviteUrl: '/invite',
    discordInviteUrl: clientId ? buildDiscordInviteUrl(clientId) : null,
    discordLoginUrl: '/api/auth/discord/login',
    guildCount,
    maxGuilds: Number.isFinite(maxGuilds) ? maxGuilds : 100,
    supportUrl,
  };
}
