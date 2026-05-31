/**
 * owl-soru.ts — AI destekli oyun içi soru-cevap komutu
 *
 * Kullanım:
 *   owl soru nasıl para kazanırım?
 *   owl soru upgrade sırası nedir?
 *   owl soru en iyi biome hangisi?
 *
 * Özellikler:
 *   - Groq API (llama-3.3-70b-versatile) ile güçlendirilmiş
 *   - Detaylı oyun bilgisi (800+ karakter prompt)
 *   - Gizli mekanikleri açıklamaz (pity, hidden scaling, vb.)
 *   - Stratejik tavsiyeler ve yönlendirme
 *
 * Cooldown: 30 saniye (spam önlemi)
 * Limit: Soru max 200 karakter
 */

import { EmbedBuilder, type Message } from 'discord.js';
import { askGameQuestion } from '../systems/ai-qa';
import { armCooldown, peekCooldown } from '../middleware/cooldown-manager';
import type { CommandDefinition } from '../types';
import { buildCooldownMessage } from '../utils/command-error';

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
      `🤖 **AI Oyun Asistanı**\n\n` +
      `Oyunla ilgili her şeyi sorabilirsin!\n\n` +
      `**Kullanım:** \`${helpPrefix} soru <sorunuz>\`\n\n` +
      `**Örnek sorular:**\n` +
      `• \`${helpPrefix} soru nasıl para kazanırım?\`\n` +
      `• \`${helpPrefix} soru upgrade sırası nedir?\`\n` +
      `• \`${helpPrefix} soru en iyi biome hangisi?\`\n` +
      `• \`${helpPrefix} soru prestige ne zaman yapmalıyım?\`\n` +
      `• \`${helpPrefix} soru tame şansını nasıl artırırım?\`\n\n` +
      `💡 Stratejik tavsiyeler, komut açıklamaları ve oyun mekaniği hakkında bilgi alabilirsin.`,
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
  const cooldown = await peekCooldown(ctx.redis, cooldownKey);
  if (cooldown.active) {
    if (!cooldown.notify) return;
    await message.reply(buildCooldownMessage(cooldown.remainingMs, 'Tekrar soru sorabilirsin'));
    return;
  }

  // Typing göstergesi
  if ('sendTyping' in message.channel) {
    await (message.channel as any).sendTyping().catch(() => null);
  }

  try {
    const cevap = await askGameQuestion(soru, message.author.id, ctx.prisma, ctx.redis);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🤖 AI Oyun Asistanı')
      .setDescription(`**Soru:** ${soru}`)
      .addFields(
        { name: '💡 Cevap', value: cevap, inline: false },
      )
      .setFooter({ 
        text: `${message.member?.displayName ?? message.author.username} · Daha fazla soru için: ${helpPrefix} soru <soru>` 
      })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
    await armCooldown(ctx.redis, cooldownKey, SORU_COOLDOWN_MS);

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Bir hata oluştu.';
    await message.reply(`❌ **Hata** | ${errMsg}\n\n💡 Lütfen sorunuzu daha açık bir şekilde sorun veya daha sonra tekrar deneyin.`);
  }
}
