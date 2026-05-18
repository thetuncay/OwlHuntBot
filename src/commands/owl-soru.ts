/**
 * owl-soru.ts — Oyun içi soru-cevap komutu
 *
 * Kullanım:
 *   owl soru nasıl para kazanırım?
 *   owl soru upgrade sırası nedir?
 *
 * Cooldown: 30 saniye (spam önlemi)
 * Limit: Soru max 200 karakter
 */

import { EmbedBuilder, type Message } from 'discord.js';
import { askGameQuestion } from '../systems/ai-qa';
import { getCooldownRemainingMs } from '../middleware/cooldown';
import type { CommandDefinition } from '../types';

const SORU_COOLDOWN_MS = 30_000; // 30 saniye
const MAX_SORU_LENGTH = 200;

export async function runSoruMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
): Promise<void> {
  const soru = args.join(' ').trim();

  // Soru girilmemişse kullanım göster
  if (!soru) {
    await message.reply(
      `❓ **Kullanım:** \`${helpPrefix} soru <sorunuz>\`\n` +
      `> Örnek: \`${helpPrefix} soru nasıl para kazanırım?\`\n` +
      `> Örnek: \`${helpPrefix} soru upgrade sırası nedir?\``,
    );
    return;
  }

  // Uzunluk kontrolü
  if (soru.length > MAX_SORU_LENGTH) {
    await message.reply(`❌ Soru en fazla **${MAX_SORU_LENGTH}** karakter olabilir.`);
    return;
  }

  // Cooldown kontrolü
  const cooldownKey = `cooldown:soru:${message.author.id}`;
  const remaining = await getCooldownRemainingMs(ctx.redis, cooldownKey, SORU_COOLDOWN_MS);
  if (remaining > 0) {
    const secs = Math.ceil(remaining / 1000);
    const sent = await message.reply(`⏰ Tekrar soru sormak için **${secs}s** beklemelisin.`);
    setTimeout(() => sent.delete().catch(() => null), 4000);
    return;
  }

  // Typing göstergesi
  if ('sendTyping' in message.channel) {
    await (message.channel as any).sendTyping().catch(() => null);
  }

  try {
    const cevap = await askGameQuestion(soru);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🦉 Oyun Asistanı')
      .addFields(
        { name: '❓ Soru', value: soru, inline: false },
        { name: '💡 Cevap', value: cevap, inline: false },
      )
      .setFooter({ text: `${message.member?.displayName ?? message.author.username} · ${helpPrefix} soru <soru>` });

    await message.reply({ embeds: [embed] });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Bir hata oluştu.';
    await message.reply(`❌ **Hata** | ${errMsg}`);
  }
}
