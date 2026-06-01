import type {
  Interaction,
  Message,
  MessageCreateOptions,
  MessageReplyOptions,
} from 'discord.js';
import {
  acquireUserResponse,
  deriveSuppressionKeyFromError,
  SuppressionKeys,
  type ResponseSuppressionScope,
} from './response-suppression';
import { safeReply } from './safe-reply';
import {
  shouldNotifyUserOnDiscord,
  SpamBlockedError,
  userErrorMessage,
} from './command-error';

export type GuardedScope = Pick<ResponseSuppressionScope, 'userId' | 'guildId' | 'key' | 'ttlMs'>;

function scopeFromMessage(message: Message, key: string, ttlMs?: number): GuardedScope {
  return {
    userId: message.author.id,
    guildId: message.guildId,
    key,
    ttlMs,
  };
}

/** Bastirma kontrolu + prefix reply. Bastirildiyse null (Discord API yok). */
export async function replyWithSuppression(
  message: Message,
  payload: string | MessageReplyOptions | MessageCreateOptions,
  key: string,
  ttlMs?: number,
): Promise<Message | null> {
  const scope = scopeFromMessage(message, key, ttlMs);
  if (!acquireUserResponse(scope)) return null;
  return safeReply(message, payload, { skipSuppression: true });
}

/** Catch bloklari: hata kullaniciya gosterilmeli mi + bastirma. */
export async function notifyPrefixUserError(
  message: Message,
  error: unknown,
): Promise<boolean> {
  if (error instanceof SpamBlockedError) {
    if (error.silent || !error.message) return true;
    const scope = scopeFromMessage(message, 'spam:mute');
    if (!acquireUserResponse(scope)) return true;
    await safeReply(message, error.message, { skipSuppression: true });
    return true;
  }
  if (!shouldNotifyUserOnDiscord(error)) return false;
  const key = deriveSuppressionKeyFromError(error);
  const scope = scopeFromMessage(message, key);
  if (!acquireUserResponse(scope)) return true;
  await safeReply(message, userErrorMessage(error), { skipSuppression: true });
  return true;
}

export async function notifyInteractionUserError(
  interaction: Interaction,
  error: unknown,
  opts?: { useEmbed?: boolean; embed?: (title: string, body: string) => { embeds: unknown[] } },
): Promise<boolean> {
  if (!interaction.isRepliable()) return false;

  if (error instanceof SpamBlockedError) {
    if (error.silent || !error.message) return true;
    const scope: GuardedScope = {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      key: 'spam:mute',
    };
    if (!acquireUserResponse(scope)) return true;
    await deliverInteractionPayload(interaction, { content: error.message, flags: 64 });
    return true;
  }

  if (!shouldNotifyUserOnDiscord(error)) return false;

  const key = deriveSuppressionKeyFromError(error);
  const scope: GuardedScope = {
    userId: interaction.user.id,
    guildId: interaction.guildId,
    key,
  };
  if (!acquireUserResponse(scope)) return true;

  const text = userErrorMessage(error);
  if (opts?.useEmbed && opts.embed) {
    await deliverInteractionPayload(interaction, {
      embeds: opts.embed('Bilgi', text).embeds as never[],
      flags: 64,
    });
  } else {
    await deliverInteractionPayload(interaction, { content: text, flags: 64 });
  }
  return true;
}

async function deliverInteractionPayload(
  interaction: Interaction,
  payload: { content?: string; embeds?: never[]; flags?: number },
): Promise<void> {
  if (!interaction.isRepliable()) return;
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch {
    /* token expired vb. */
  }
}

/** Cooldown / kullanim mesajlari — peekCooldown.notify ile birlikte kullanilir. */
export async function replyCooldownIfAllowed(
  message: Message,
  cooldownKey: string,
  content: string,
): Promise<Message | null> {
  return replyWithSuppression(message, content, SuppressionKeys.cooldown(cooldownKey));
}

/** Slash / ephemeral hata ve bilgi mesajlari. */
export async function interactionReplyWithSuppression(
  interaction: Interaction,
  payload: { content: string; flags?: number },
  key: string,
): Promise<boolean> {
  if (!interaction.isRepliable()) return false;
  const scope: GuardedScope = {
    userId: interaction.user.id,
    guildId: interaction.guildId,
    key,
  };
  if (!acquireUserResponse(scope)) return false;
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch {
    /* ignore */
  }
  return true;
}

export { SuppressionKeys };
