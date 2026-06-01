import type { Message, MessageCreateOptions, MessageReplyOptions } from 'discord.js';
import { acquireUserResponse } from './response-suppression';

function isUnknownReferenceError(err: unknown): boolean {
  const e = err as { code?: number; message?: string };
  const msg = e?.message ?? '';
  return e?.code === 50035
    || msg.includes('MESSAGE_REFERENCE_UNKNOWN')
    || msg.includes('Unknown message');
}

export type SafeReplyOptions = {
  /** Bastirma anahtari — tekrarlayan ayni hata icin ikinci yaniti engeller. */
  suppressionKey?: string;
  /** true ise bastirma kontrolu atlanir (ust katman zaten kontrol etti). */
  skipSuppression?: boolean;
};

/**
 * Prefix komutlarda reply dener; referans mesajı yoksa channel.send fallback.
 * suppressionKey verilirse tekrarlayan yanitlar bastirilir (null doner, API yok).
 */
export async function safeReply(
  message: Message,
  payload: string | MessageReplyOptions | MessageCreateOptions,
  opts?: SafeReplyOptions,
): Promise<Message | null> {
  if (!opts?.skipSuppression && opts?.suppressionKey) {
    const allowed = acquireUserResponse({
      userId: message.author.id,
      guildId: message.guildId,
      key: opts.suppressionKey,
    });
    if (!allowed) return null;
  }

  const options = typeof payload === 'string' ? { content: payload } : payload;
  try {
    return await message.reply(options as MessageReplyOptions);
  } catch (err) {
    if (!isUnknownReferenceError(err) || !message.channel?.isSendable()) throw err;
    return message.channel.send(options as MessageCreateOptions);
  }
}
