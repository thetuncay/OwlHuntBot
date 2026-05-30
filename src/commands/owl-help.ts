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
    `\`${p} ver @kullanıcı <miktar>\` — Birine coin gönder`,
    `\`${p} lb\` — Liderboard sıralamalarını gör`,
    `\`${p} quests\` · \`${p} q\` — Günlük görevleri gör ve ödül al`,
    `\`${p} prestige <baykuş_id>\` — Baykuşu feda et, kalıcı bonus kazan`,
  ].join('\n');

  const aiSection = [
    `🤖 **\`${p} soru <sorunuz>\`** — AI destekli oyun asistanı`,
    ``,
    `Oyunla ilgili her şeyi sorabilirsin:`,
    `• \`${p} soru nasıl para kazanırım?\``,
    `• \`${p} soru upgrade sırası nedir?\``,
    `• \`${p} soru en iyi biome hangisi?\``,
    `• \`${p} soru prestige ne zaman yapmalıyım?\``,
    ``,
    `💡 Anlamadığın bir şey mi var? Hemen sor!`,
  ].join('\n');

  const eşyaSection = [
    `\`${p} sk\` — 1 silah kutusu aç`,
    `\`${p} sk all\` — tüm silah kutularını aç`,
    `\`${p} ek\` — 1 eşya kutusu aç`,
    `\`${p} ek all\` — tüm eşya kutularını aç`,
    `\`${p} aç\` — kutu envanterini gör`,
    `\`${p} craft\` — Crafting menüsünü aç, eşya üret`,
    `\`${p} dismantle <eşya> [miktar]\` — Eşyayı parçala, materyal kazan`,
    `\`${p} market\` — Global marketplace (serbest piyasa)`,
    `\`${p} market owl/item/buff/material [sayfa]\` — Kategori tara`,
    `\`${p} market sell <eşya adı> [miktar] <fiyat>\` — İlan aç (%1 listeleme ücreti)`,
    `\`${p} market sell owl <kısa_id> <fiyat>\` — Baykuş sat (\`${p} owls\` ile ID)`,
    `\`${p} buy <ilanNo>\` · \`${p} market al <ilanNo>\` — Satın al (%5 vergi)`,
    `\`${p} market search <kelime>\` — Ara`,
    `\`${p} market info <ilanNo>\` — Piyasa bilgisi + detay`,
    `\`${p} market my\` — Aktif ilanların (max 5)`,
    `\`${p} market cancel <ilanNo>\` — İlan iptal`,
    `\`${p} msell <eşya> <miktar> <fiyat>\` — market sell kısayolu`,
    `\`${p} craft\` — Craft menüsü (8 tarif)`,
    `\`${p} craftinfo <id>\` — Tarif detayı (013–020)`,
    `\`${p} craft <id>\` — Belirli tarifi üret`,
    `\`${p} use <id>\` · \`${p} u <id>\` — Buff (001–012) veya craft item (013–020)`,
    `\`${p} use\` — Yük slotlarını gör (max 2 craft item)`,
    `\`${p} buffs\` — Tüm buff rehberini gör`,
  ].join('\n');

  const ipucuSection = [
    `• Av, main değişimi ve bazı işlemlerde cooldown var`,
    `• Upgrade başarı garantili değil; stat yükseldikçe zorlaşır`,
    `• PvP davetleri 60 saniye geçerli`,
    `• \`${p} upgrade\` yazınca bağımlılık sistemi gösterilir`,
    `• Lootbox hunt, PvP ve encounter'dan otomatik düşer`,
    `• Prestige için oyuncu Lv.30+ ve baykuş ort. stat 80+ gerekir`,
  ].join('\n');

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🦉 Owl Komutları')
    .setDescription(`Prefix: \`${p}\` · Slash: \`/owl\``)
    .addFields(
      { name: '🤖 AI Asistan (YENİ!)', value: aiSection, inline: false },
      { name: '🌿 Av & Baykuş', value: avSection, inline: false },
      { name: '⚔️ PvP', value: pvpSection, inline: false },
      { name: '🎲 Kumar', value: kumarSection, inline: false },
      { name: '💰 Ekonomi & Görevler', value: ekonomiSection, inline: false },
      { name: '🎒 Eşya & Market', value: eşyaSection, inline: false },
      { name: '💡 İpuçları', value: ipucuSection, inline: false },
    )
    .setFooter({ text: `Tüm komutlar ${p} <komut> formatında çalışır` });
}
