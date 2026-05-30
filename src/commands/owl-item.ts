/**
 * owl-item.ts — owl item (geriye dönük uyumluluk → use)
 *
 * Consumable kullanımı artık `owl use 013` ile yapılır.
 */

import type { Message } from 'discord.js';
import type { CommandDefinition } from '../types';
import { getActiveConsumables } from '../utils/use-items';
import { runUseMessage } from './owl-use';

export { getActiveConsumables };

export async function runItemMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
): Promise<void> {
  await runUseMessage(message, args, ctx, helpPrefix);
}
