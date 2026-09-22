/**
 * owl-social.ts — w kiss / hug / love / punch … sosyal GIF komutları (SFW)
 */

import { EmbedBuilder, type Message } from 'discord.js';
import type { CommandContext } from '../types';
import {
  SOCIAL_ACTION_COOLDOWN_MS,
  resolveSocialAction,
  type SocialActionDef,
} from '../config/social-actions';
import { formatSocialActionText, resolveSocialGifUrl } from '../systems/social-gifs';
import { replyWithSuppression, SuppressionKeys } from '../utils/guarded-discord';
import { safeReply } from '../utils/safe-reply';

function displayName(message: Message, userId: string): string {
  if (userId === message.author.id) {
    return message.member?.displayName ?? message.author.displayName ?? message.author.username;
  }
  const member = message.mentions.members?.get(userId);
  if (member) return member.displayName;
  const user = message.mentions.users.get(userId);
  return user?.displayName ?? user?.username ?? 'birisi';
}

function resolveTargetUser(message: Message): { id: string; bot: boolean } | null {
  const mentioned = message.mentions.users.filter((u) => u.id !== message.client.user?.id);
  const first = mentioned.first();
  if (first) return { id: first.id, bot: first.bot };
  return null;
}

/**
 * Sosyal aksiyon komutu.
 *
 * @param message Discord mesajı
 * @param args Prefix sonrası argümanlar
 * @param ctx Bağlam
 * @param action Canonical aksiyon id veya alias (router’dan)
 * @param prefix Yardım prefix
 */
export async function runSocialActionMessage(
  message: Message,
  args: string[],
  ctx: CommandContext,
  action: string,
  prefix: string,
): Promise<void> {
  const def = resolveSocialAction(action);
  if (!def) {
    await replyWithSuppression(
      message,
      `❌ Bilinmeyen aksiyon. Örnek: \`${prefix} kiss @kisi\``,
      SuppressionKeys.usage('social', action),
    );
    return;
  }

  const cdKey = `cd:social:${message.author.id}`;
  const busy = await ctx.redis.set(cdKey, '1', 'PX', SOCIAL_ACTION_COOLDOWN_MS, 'NX');
  if (busy !== 'OK') {
    await replyWithSuppression(
      message,
      '⏳ Biraz yavaş…',
      SuppressionKeys.state('social-cd'),
    );
    return;
  }

  const target = resolveTargetUser(message);
  if (!target) {
    await replyWithSuppression(
      message,
      `Kullanım: \`${prefix} ${def.names[0]} @kisi\``,
      SuppressionKeys.usage('social', def.id),
    );
    return;
  }
  if (target.id === message.author.id) {
    await replyWithSuppression(
      message,
      '❌ Kendine bunu yapamazsın.',
      SuppressionKeys.usage('social-self', def.id),
    );
    return;
  }
  if (target.bot) {
    await replyWithSuppression(
      message,
      '❌ Botlara değil, oyunculara dene.',
      SuppressionKeys.usage('social-bot', def.id),
    );
    return;
  }

  const actorName = displayName(message, message.author.id);
  const targetName = displayName(message, target.id);
  const headline = formatSocialActionText(def, actorName, targetName);
  const gifUrl = await resolveSocialGifUrl(def, ctx.redis);

  const embed = new EmbedBuilder()
    .setColor(def.color)
    .setAuthor({
      name: headline,
      iconURL: message.author.displayAvatarURL({ size: 64 }),
    });

  if (gifUrl) {
    embed.setImage(gifUrl);
  } else {
    embed.setDescription('_GIF şu an yüklenemedi — biraz sonra tekrar dene._');
  }

  await safeReply(message, { embeds: [embed] });
  void args;
}

/** Router: aksiyon adı geçerli mi? */
export function isSocialActionCommand(sub: string): boolean {
  return resolveSocialAction(sub) !== null;
}

export type { SocialActionDef };
