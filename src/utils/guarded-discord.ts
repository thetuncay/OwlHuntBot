import {
  AttachmentBuilder,
  type Interaction,
  type Message,
  type MessageCreateOptions,
  type MessageReplyOptions,
  type User,
} from 'discord.js';
import type { Redis } from 'ioredis';
import { COOLDOWN_NOTICE_AUTO_DELETE_MS } from '../config';
import {
  acquireUserResponse,
  deriveSuppressionKeyFromError,
  SuppressionKeys,
  type ResponseSuppressionScope,
} from './response-suppression';
import { safeReply } from './safe-reply';
import {
  buildInflightBusyMessage,
  shouldNotifyUserOnDiscord,
  SpamBlockedError,
  userErrorMessage,
} from './command-error';
import { LockContentionError } from './lock';
import { resolveFlowRejectMessage, resolveLockErrorMessage } from './flow-helpers';
import { ChallengeRequiredError } from '../anticheat/challenge-errors';
import { challengeSuppressionKey } from '../anticheat/challenge-gate';
import {
  getActiveChallengeSession,
  markCaptchaChannelDelivery,
} from '../anticheat/challenge-manager';
import { buildCaptchaDmPayload, trySendCaptchaDm } from '../anticheat/captcha-delivery';
import { redis as sharedRedis } from './redis';

export type FlowNotifyContext = {
  redis: Redis;
  command: string;
};

export type GuardedScope = Pick<ResponseSuppressionScope, 'userId' | 'guildId' | 'key' | 'ttlMs'>;

/**
 * Kanal mesajını gecikmeli siler (cooldown uyarıları).
 * Hata yutulur (mesaj zaten silinmiş olabilir).
 */
export function scheduleMessageAutoDelete(
  message: Message | null | undefined,
  delayMs: number = COOLDOWN_NOTICE_AUTO_DELETE_MS,
): void {
  if (!message || delayMs <= 0) return;
  setTimeout(() => {
    void message.delete().catch(() => null);
  }, delayMs);
}

function shouldAutoDeleteSuppressionKey(key: string): boolean {
  return key.startsWith('cooldown:');
}

function buildChallengeDeliveryPayload(error: ChallengeRequiredError): MessageCreateOptions {
  const files = error.payload.files.map(
    (f) => new AttachmentBuilder(f.attachment, { name: f.name }),
  );
  return {
    content: `${error.message}\n\n${error.payload.content}`,
    files,
  };
}

function buildChallengeChannelNotice(error: ChallengeRequiredError): string {
  return (
    `${error.message}\n\n` +
    `📩 Captcha **DM** olarak gönderildi. Görseli ve kodu **DM'den** yanıtla.\n` +
    `_(DM kapalıysa sunucu ayarlarından OwlHunt'a mesaj izni ver.)_`
  );
}

async function deliverCaptchaChallenge(
  redis: Redis,
  user: User,
  error: ChallengeRequiredError,
): Promise<'dm' | 'fallback_channel' | 'skipped'> {
  const session = await getActiveChallengeSession(redis, user.id);
  if (!session) return 'skipped';

  const result = await trySendCaptchaDm(redis, user, {
    displayName: error.displayName,
    session,
  });
  if (result === 'sent' || result === 'already_sent') return 'dm';
  return 'fallback_channel';
}

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
  const sent = await safeReply(message, payload, { skipSuppression: true });
  if (shouldAutoDeleteSuppressionKey(key)) {
    scheduleMessageAutoDelete(sent);
  }
  return sent;
}

/** Catch bloklari: hata kullaniciya gosterilmeli mi + bastirma. */
export async function notifyPrefixUserError(
  message: Message,
  error: unknown,
  flowCtx?: FlowNotifyContext,
): Promise<boolean> {
  if (error instanceof SpamBlockedError) {
    if (error.silent || !error.message) return true;
    const scope = scopeFromMessage(message, 'spam:mute');
    if (!acquireUserResponse(scope)) return true;
    await safeReply(message, error.message, { skipSuppression: true });
    return true;
  }
  if (error instanceof LockContentionError) {
    const scope = scopeFromMessage(message, SuppressionKeys.state(`lock:${error.lockAction}`));
    if (!acquireUserResponse(scope)) return true;
    let msg = error.message;
    if (flowCtx) {
      msg = await resolveLockErrorMessage(flowCtx.redis, message.author.id, flowCtx.command, error);
    }
    await safeReply(message, msg, { skipSuppression: true });
    return true;
  }
  if (error instanceof ChallengeRequiredError) {
    const scope = scopeFromMessage(message, challengeSuppressionKey());
    if (!acquireUserResponse(scope)) return true;
    const redis = flowCtx?.redis ?? sharedRedis;
    const delivered = await deliverCaptchaChallenge(redis, message.author, error);
    if (delivered === 'fallback_channel') {
      await safeReply(message, buildChallengeDeliveryPayload(error), { skipSuppression: true });
      await markCaptchaChannelDelivery(redis, message.author.id);
    }
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
  opts?: { useEmbed?: boolean; embed?: (title: string, body: string) => { embeds: unknown[] }; flowCtx?: FlowNotifyContext },
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

  if (error instanceof LockContentionError) {
    const scope: GuardedScope = {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      key: SuppressionKeys.state(`lock:${error.lockAction}`),
    };
    if (!acquireUserResponse(scope)) return true;
    let msg = error.message;
    if (opts?.flowCtx) {
      msg = await resolveLockErrorMessage(
        opts.flowCtx.redis,
        interaction.user.id,
        opts.flowCtx.command,
        error,
      );
    }
    await deliverInteractionPayload(interaction, { content: msg, flags: 64 });
    return true;
  }

  if (error instanceof ChallengeRequiredError) {
    const scope: GuardedScope = {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      key: challengeSuppressionKey(),
    };
    if (!acquireUserResponse(scope)) return true;

    const redis = opts?.flowCtx?.redis ?? sharedRedis;
    const delivered = await deliverCaptchaChallenge(redis, interaction.user, error);
    const captchaPayload = buildChallengeDeliveryPayload(error);

    if (delivered === 'skipped' || delivered === 'dm') {
      await deliverInteractionPayload(interaction, {
        content: buildChallengeChannelNotice(error),
        flags: 64,
      });
    } else {
      await deliverInteractionPayload(interaction, {
        content: captchaPayload.content,
        files: captchaPayload.files as never[],
        flags: 64,
      });
      await markCaptchaChannelDelivery(redis, interaction.user.id);
    }
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
  payload: { content?: string; embeds?: never[]; components?: never[]; files?: never[]; flags?: number },
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

/** Aynı komut zaten çalışıyorsa kısa uyarı (bastırma ile tekrar spam yok). */
export async function notifyInflightBusy(
  message: Message,
  displayName?: string,
  key = SuppressionKeys.state('command-inflight'),
  flowCtx?: FlowNotifyContext,
): Promise<void> {
  let content = buildInflightBusyMessage(displayName);
  if (flowCtx) {
    content = await resolveFlowRejectMessage(
      flowCtx.redis,
      message.author.id,
      flowCtx.command,
      'inflight',
      content,
    );
  }
  await replyWithSuppression(message, content, key);
}

export async function notifyInflightBusyInteraction(
  interaction: Interaction,
  displayName?: string,
  key = SuppressionKeys.state('command-inflight'),
  flowCtx?: FlowNotifyContext,
): Promise<void> {
  let content = buildInflightBusyMessage(displayName);
  if (flowCtx) {
    content = await resolveFlowRejectMessage(
      flowCtx.redis,
      interaction.user.id,
      flowCtx.command,
      'inflight',
      content,
    );
  }
  await interactionReplyWithSuppression(
    interaction,
    { content, flags: 64 },
    key,
  );
}

/** Cooldown / kullanim mesajlari — suppression ile tekrarlar bastirilir (notify bayragi gerekmez). */
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
