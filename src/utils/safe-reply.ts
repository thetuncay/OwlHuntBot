import type { Message, MessageCreateOptions, MessageReplyOptions } from 'discord.js';

function isUnknownReferenceError(err: unknown): boolean {
  const e = err as { code?: number; message?: string };
  const msg = e?.message ?? '';
  return e?.code === 50035
    || msg.includes('MESSAGE_REFERENCE_UNKNOWN')
    || msg.includes('Unknown message');
}

/**
 * Prefix komutlarda reply dener; referans mesajı yoksa channel.send fallback.
 */
export async function safeReply(
  message: Message,
  payload: string | MessageReplyOptions | MessageCreateOptions,
): Promise<Message> {
  const options = typeof payload === 'string' ? { content: payload } : payload;
  try {
    return await message.reply(options as MessageReplyOptions);
  } catch (err) {
    if (!isUnknownReferenceError(err) || !message.channel?.isSendable()) throw err;
    return message.channel.send(options as MessageCreateOptions);
  }
}
