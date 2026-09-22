/**
 * admin-moderation.ts — Manuel ceza/uyarı (slash + prefix paylaşımlı).
 */

import type { Client, Message } from 'discord.js';
import type { Redis } from 'ioredis';
import { MOD_WARN_THRESHOLD } from '../config';
import {
  applyPermanentBan,
  applyTempBan,
  clearPlayerWarnings,
  formatDurationTr,
  getModerationState,
  issuePlayerWarning,
} from '../systems/moderation';
import {
  banKey,
  clearBanFromCache,
  isAdmin,
  scanBanKeys,
} from '../utils/admin-access';
import { sendModerationDm } from '../utils/moderation-dm';
import { removeBannedPlayerFromLeaderboards } from '../systems/leaderboard-write';
import { replyWithSuppression, SuppressionKeys } from '../utils/guarded-discord';

export interface ModerationActor {
  redis: Redis;
  client: Client;
  issuerId: string;
}

function dmSuffix(sent: boolean): string {
  return sent ? '\n📨 DM gönderildi.' : '\n⚠️ DM gönderilemedi (kapalı olabilir).';
}

export async function executeModerationBan(
  actor: ModerationActor,
  targetUserId: string,
  sebep: string,
  sureDk?: number | null,
): Promise<string> {
  const reason = sebep.trim() || 'Sebep belirtilmedi';

  if (sureDk && sureDk > 0) {
    const durationSec = sureDk * 60;
    await applyTempBan(actor.redis, targetUserId, reason, durationSec);
    await removeBannedPlayerFromLeaderboards(actor.redis, targetUserId);
    const dmSent = await sendModerationDm(actor.client, targetUserId, {
      type: 'banned',
      durationSec,
      banTier: -1,
      reason,
      warnCount: 0,
    });
    return (
      `🔨 <@${targetUserId}> **${formatDurationTr(durationSec)}** süreyle engellendi.\n` +
      `📝 Sebep: **${reason}**` +
      dmSuffix(dmSent)
    );
  }

  await applyPermanentBan(actor.redis, targetUserId, reason);
  await removeBannedPlayerFromLeaderboards(actor.redis, targetUserId);
  const dmSent = await sendModerationDm(actor.client, targetUserId, {
    type: 'banned',
    durationSec: 0,
    banTier: -1,
    reason,
    warnCount: 0,
  });
  return (
    `🔨 <@${targetUserId}> bota erişimden **kalıcı** engellendi.\n` +
    `📝 Sebep: **${reason}**` +
    dmSuffix(dmSent)
  );
}

export async function executeModerationWarn(
  actor: ModerationActor,
  targetUserId: string,
  sebep: string,
): Promise<string> {
  if (isAdmin(targetUserId)) {
    return '❌ Admin kullanıcıya uyarı verilemez.';
  }

  const reason = sebep.trim() || 'Sebep belirtilmedi';
  const result = await issuePlayerWarning(actor.redis, {
    userId: targetUserId,
    reason,
    source: 'admin',
    issuerId: actor.issuerId,
  });

  const dmSent = await sendModerationDm(actor.client, targetUserId, result);

  if (result.type === 'warned') {
    return (
      `⚠️ <@${targetUserId}> uyarıldı — **${result.warnCount}/${result.threshold}**\n` +
      `📝 Sebep: **${reason}**` +
      dmSuffix(dmSent)
    );
  }

  return (
    `🔨 <@${targetUserId}> **${result.warnCount} uyarı** eşiğine ulaştı — ` +
    `**${formatDurationTr(result.durationSec)}** otomatik ban.\n` +
    `📝 Sebep: **${reason}**` +
    dmSuffix(dmSent)
  );
}

export async function executeModerationUnban(
  actor: ModerationActor,
  targetUserId: string,
): Promise<string> {
  const exists = await actor.redis.get(banKey(targetUserId));
  if (!exists) {
    return `ℹ️ <@${targetUserId}> zaten engelli değil.`;
  }

  await actor.redis.del(banKey(targetUserId));
  clearBanFromCache(targetUserId);
  return `✅ <@${targetUserId}> engellemesi kaldırıldı.`;
}

export async function executeModerationWarnings(
  actor: ModerationActor,
  targetUserId: string,
): Promise<string> {
  const state = await getModerationState(actor.redis, targetUserId);

  const lines = state.warnings.length > 0
    ? state.warnings.map((w, i) => {
        const who =
          w.source === 'admin' && w.issuerId
            ? `<@${w.issuerId}>`
            : w.source === 'auto_spam'
              ? 'Otomatik (spam)'
              : 'Sistem';
        const when = w.at.slice(0, 16).replace('T', ' ');
        return `${i + 1}. **${w.reason}** — ${who} · ${when}`;
      })
    : ['Kayıt yok.'];

  return (
    `⚠️ **Uyarı durumu — <@${targetUserId}>**\n\n` +
    `Aktif sayaç: **${state.warnCount}/${MOD_WARN_THRESHOLD}** · Ban kademesi: **${state.banTier}** ` +
    `(sonraki otomatik ban: **${formatDurationTr(state.nextBanDurationSec)}**)\n\n` +
    lines.join('\n')
  );
}

export async function executeModerationClearWarnings(
  actor: ModerationActor,
  targetUserId: string,
): Promise<string> {
  await clearPlayerWarnings(actor.redis, targetUserId);
  return `✅ <@${targetUserId}> aktif uyarı sayacı sıfırlandı. (Geçmiş log korunur.)`;
}

export async function executeModerationBanlist(actor: ModerationActor): Promise<string> {
  const keys = await scanBanKeys(actor.redis);
  if (keys.length === 0) {
    return 'ℹ️ Engellenen oyuncu yok.';
  }

  const entries = await Promise.all(
    keys.map(async (k) => {
      const userId = k.replace('ban:', '');
      const sebep = await actor.redis.get(k);
      const ttl = await actor.redis.ttl(k);
      const ttlHint = ttl > 0 ? ` · ⏱️ ${formatDurationTr(ttl)} kaldı` : '';
      return `• <@${userId}> — ${sebep ?? 'Sebep yok'}${ttlHint}`;
    }),
  );

  return `🔨 **Engellenen Oyuncular** (${keys.length})\n\n${entries.join('\n')}`;
}

export function buildAdminModHelp(prefix: string): string {
  const p = prefix;
  return (
    `**Admin ceza komutları** (sadece bot admin)\n\n` +
    `\`${p} admin uyari @oyuncu <sebep>\` — uyarı ver\n` +
    `\`${p} admin ban @oyuncu <sebep> [dakika]\` — ban (dakika yoksa kalıcı)\n` +
    `\`${p} admin unban @oyuncu\` — engeli kaldır\n` +
    `\`${p} admin durum @oyuncu\` — uyarı geçmişi\n` +
    `\`${p} admin sifirla @oyuncu\` — uyarı sayacını sıfırla\n` +
    `\`${p} admin liste\` — engelli oyuncular\n\n` +
    `Slash: \`/admin-uyari\` · \`/admin-ban\` · \`/admin-unban\` · \`/admin-durum\` · \`/admin-sifirla\` · \`/admin-banlist\``
  );
}

/** @deprecated use buildAdminModHelp */
export const buildCezaHelp = buildAdminModHelp;

function parseUserIdFromToken(token: string | undefined): string | null {
  if (!token) return null;
  const mention = token.match(/^<@!?(\d+)>$/);
  if (mention?.[1]) return mention[1];
  if (/^\d{17,20}$/.test(token)) return token;
  return null;
}

function resolveTargetUserId(message: Message, args: string[]): string | null {
  const mentioned = message.mentions.users.first();
  if (mentioned) return mentioned.id;

  for (const arg of args) {
    const id = parseUserIdFromToken(arg);
    if (id) return id;
  }
  return null;
}

const CEZA_ALIASES: Record<string, string> = {
  uyari: 'warn',
  uyar: 'warn',
  u: 'warn',
  warn: 'warn',
  ban: 'ban',
  b: 'ban',
  unban: 'unban',
  ub: 'unban',
  durum: 'warnings',
  warnings: 'warnings',
  w: 'warnings',
  sifirla: 'clearwarnings',
  sıfırla: 'clearwarnings',
  clearwarnings: 'clearwarnings',
  cw: 'clearwarnings',
  liste: 'banlist',
  banlist: 'banlist',
  lb: 'banlist',
  yardim: 'help',
  yardım: 'help',
  help: 'help',
};

function extractReasonTokens(restArgs: string[], message: Message): string[] {
  const skip = new Set<string>();
  for (const user of message.mentions.users.values()) {
    skip.add(user.id);
    skip.add(`<@${user.id}>`);
    skip.add(`<@!${user.id}>`);
  }
  for (const arg of restArgs) {
    if (parseUserIdFromToken(arg)) skip.add(arg);
  }
  return restArgs.filter((a) => !skip.has(a));
}

/**
 * Prefix: `w admin uyari @user sebep` (ceza alias desteklenir)
 */
export async function runAdminModMessage(
  message: Message,
  args: string[],
  ctx: { redis: Redis; prisma: unknown },
  helpPrefix: string,
): Promise<void> {
  if (!isAdmin(message.author.id)) {
    await replyWithSuppression(
      message,
      '❌ Bu komutu sadece bot admin kullanabilir.',
      SuppressionKeys.permission('admin-mod'),
    );
    return;
  }

  const subRaw = (args[0] ?? '').toLowerCase();
  const sub = CEZA_ALIASES[subRaw] ?? subRaw;
  const actor: ModerationActor = {
    redis: ctx.redis,
    client: message.client,
    issuerId: message.author.id,
  };

  if (!sub || sub === 'help') {
    await message.reply(buildAdminModHelp(helpPrefix));
    return;
  }

  if (sub === 'banlist') {
    const text = await executeModerationBanlist(actor);
    await message.reply(text);
    return;
  }

  const restArgs = args.slice(1);
  const targetUserId = resolveTargetUserId(message, restArgs);

  if (!targetUserId) {
    await replyWithSuppression(
      message,
      `❌ Oyuncu belirt.\n${buildAdminModHelp(helpPrefix)}`,
      SuppressionKeys.usage('admin-mod'),
    );
    return;
  }

  const textParts = extractReasonTokens(restArgs, message);

  let reply: string;

  switch (sub) {
    case 'warn': {
      const sebep = textParts.join(' ').trim();
      if (!sebep) {
        await replyWithSuppression(
          message,
          `❌ Sebep zorunlu.\n\`${helpPrefix} admin uyari @oyuncu <sebep>\``,
          SuppressionKeys.usage('admin-mod-warn'),
        );
        return;
      }
      reply = await executeModerationWarn(actor, targetUserId, sebep);
      break;
    }
    case 'ban': {
      let sureDk: number | undefined;
      let sebepParts = [...textParts];
      const last = sebepParts[sebepParts.length - 1];
      if (last && /^\d+$/.test(last)) {
        sureDk = Number.parseInt(last, 10);
        sebepParts = sebepParts.slice(0, -1);
      }
      const sebep = sebepParts.join(' ').trim() || 'Sebep belirtilmedi';
      reply = await executeModerationBan(actor, targetUserId, sebep, sureDk);
      break;
    }
    case 'unban':
      reply = await executeModerationUnban(actor, targetUserId);
      break;
    case 'warnings':
      reply = await executeModerationWarnings(actor, targetUserId);
      break;
    case 'clearwarnings':
      reply = await executeModerationClearWarnings(actor, targetUserId);
      break;
    default:
      await replyWithSuppression(
        message,
        `❌ Bilinmeyen alt komut: \`${subRaw}\`\n${buildAdminModHelp(helpPrefix)}`,
        SuppressionKeys.usage('admin-mod-unknown'),
      );
      return;
  }

  await message.reply(reply);
}

/** @deprecated ceza alias — runAdminModMessage kullan */
export const runCezaMessage = runAdminModMessage;
