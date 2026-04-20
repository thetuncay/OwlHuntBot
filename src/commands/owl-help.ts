/**
 * owl-help.ts — /owl yardim komutu
 */

import { EmbedBuilder } from 'discord.js';
import type { CommandDefinition } from '../types';

export async function runYardim(
  interaction: Parameters<CommandDefinition['execute']>[0],
): Promise<void> {
  await interaction.reply({ embeds: [buildHelpEmbed('owl')], flags: 64 });
}

export function buildHelpEmbed(prefix: string): EmbedBuilder {
  const p = prefix;

  const avSection = [
    `\`${p} hunt\` · \`${p} h\` — Baykuşunu avlanmaya gönder`,
    `\`${p} tame <id>\` · \`${p} t\` — Yabani baykuşu evcilleştir`,
    `\`${p} stats\` · \`${p} s\` — Baykuş istatistiklerini gör`,
    `\`${p} owls\` — Tüm baykuşlarını listele`,
    `\`${p} inventory\` · \`${p} inv\` — Envanterini kontrol et`,
    `\`${p} sell\` · \`${p} sell all\` — Avladıklarını sat`,
    `\`${p} zoo\` · \`${p} z\` — Hayvanat bahçeni gör`,
    `\`${p} upgrade <stat>\` · \`${p} up\` — Stat geliştir`,
    `\`${p} setmain <id>\` · \`${p} sm\` — Main baykuşu değiştir`,
  ].join('\n');

  const pvpSection = [
    `\`${p} vs <@oyuncu>\` — Gerçek oyuncuya meydan oku`,
    `\`${p} duel\` · \`${p} d\` — Bot ile hızlı duel`,
  ].join('\n');

  const kumarSection = [
    `\`${p} bj <miktar>\` — Blackjack oyna`,
    `\`${p} cf <miktar>\` — Yazı tura`,
    `\`${p} slot <miktar>\` — Slot makinesi`,
  ].join('\n');

  const ekonomiSection = [
    `\`${p} cash\` · \`${p} c\` — Mevcut bakiyeni gör`,
    `\`${p} lb\` — Liderboard sıralamalarını gör`,
  ].join('\n');

  const ipucuSection = [
    `• Av, main değişimi ve bazı işlemlerde cooldown var`,
    `• Upgrade başarı garantili değil; stat yükseldikçe zorlaşır`,
    `• PvP davetleri 60 saniye geçerli`,
    `• \`${p} upgrade\` yazınca bağımlılık sistemi gösterilir`,
  ].join('\n');

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🦉 Owl Komutları')
    .setDescription(`Prefix: \`${p}\` · Slash: \`/owl\``)
    .addFields(
      { name: '🌿 Av & Baykuş', value: avSection, inline: false },
      { name: '⚔️ PvP', value: pvpSection, inline: false },
      { name: '🎲 Kumar', value: kumarSection, inline: false },
      { name: '💰 Ekonomi', value: ekonomiSection, inline: false },
      { name: '💡 İpuçları', value: ipucuSection, inline: false },
    )
    .setFooter({ text: `Tüm komutlar ${p} <komut> formatında çalışır` });
}
