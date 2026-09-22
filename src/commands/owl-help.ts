/**
 * owl-help.ts — /owl yardim komutu (hub + kategori sayfaları)
 */

import { EmbedBuilder, type Message } from 'discord.js';
import { DUEL_DAILY_COIN_CAP } from '../config';
import { COIN_EMOJI, XP_EMOJI } from '../config/ui-emojis';
import { COLORS } from '../utils/theme';
import { buildDropRatesEmbed } from '../utils/drop-rates-ux';
import { buildHelpDiscordFooter } from '../utils/community-discord';
import { embedWithLostFooterIfNeeded } from '../utils/flow-helpers';
import { foldTrAscii } from '../utils/alias-command';
import type { Redis } from 'ioredis';

export const HELP_TOPIC_ALIASES: Record<string, string> = {
  av: 'av',
  hunt: 'av',
  baykus: 'av',
  baykuş: 'av',
  esya: 'esya',
  eşya: 'esya',
  item: 'esya',
  envanter: 'esya',
  pvp: 'pvp',
  duel: 'pvp',
  ekonomi: 'ekonomi',
  eco: 'ekonomi',
  para: 'ekonomi',
  market: 'market',
  pazar: 'market',
  m: 'market',
  kumar: 'kumar',
  gamble: 'kumar',
  drop: 'drop',
  droplar: 'drop',
  oran: 'drop',
  oranlar: 'drop',
  sans: 'drop',
  şans: 'drop',
  pity: 'drop',
  ipucu: 'ipucu',
  ipuclari: 'ipucu',
  ipuçları: 'ipucu',
  tips: 'ipucu',
  build: 'build',
  skill: 'build',
  sosyal: 'sosyal',
  social: 'sosyal',
  kiss: 'sosyal',
  hug: 'sosyal',
};

export const HELP_TOPIC_LABELS: Record<string, string> = {
  av: '🌿 Av & Baykuş',
  esya: '🎒 Eşya & Kutu',
  pvp: '⚔️ PvP',
  ekonomi: `${COIN_EMOJI} Ekonomi`,
  market: '📜 Pazar',
  kumar: '🎲 Kumar',
  drop: '📦 Drop Oranları',
  ipucu: '💡 İpuçları',
  build: '📐 Build',
  sosyal: '💕 Sosyal',
};

function resolveHelpTopic(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  const key = foldTrAscii(raw.trim());
  return HELP_TOPIC_ALIASES[key] ?? HELP_TOPIC_ALIASES[raw.trim().toLowerCase()] ?? (HELP_TOPIC_LABELS[key] ? key : null);
}

function buildHelpHubEmbed(prefix: string): EmbedBuilder {
  const p = prefix;
  const start = [
    `\`${p} hunt\` · \`${p} h\` — avla`,
    `\`${p} sell all\` · \`${p} sl all\` — av sat (coin)`,
    `\`${p} parçala all\` · \`${p} parçala fare\` — av parçala (materyal)`,
      `\`${p} stats\` · \`${p} st\` — baykuşun`,
      `\`${p} slot\` · \`${p} s\` — slot`,
      `\`${p} upgrade\` · \`${p} up gaga 10\` / \`${p} up kanat all\` — stat yükselt`,
    `\`${p} inv\` — envanter · \`${p} zoo\` — av koleksiyonu`,
    `\`${p} evrim\` — ay evrimi · \`${p} owls\` / \`${p} owllist\` — baykuşlar`,
  ].join('\n');

  const economyLoop = [
    `1️⃣ \`${p} hunt\` ile av topla`,
    `2️⃣ \`${p} sell all\` → coin **veya** \`${p} parçala <av>\` → materyal`,
    `3️⃣ \`${p} upgrade gaga\` ile baykuşunu güçlendir`,
  ].join('\n');

  const topics = [
    `\`${p} yardim av\` — av & baykuş`,
    `\`${p} yardim esya\` — eşya & kutu`,
    `\`${p} yardim pvp\` — PvP`,
    `\`${p} yardim ekonomi\` — coin & görev`,
    `\`${p} yardim market\` — pazar`,
    `\`${p} yardim kumar\` — kumar`,
    `\`${p} yardim drop\` — drop oranları & pity`,
    `\`${p} yardim ipucu\` — ipuçları`,
    `\`${p} yardim build\` — hangi skill`,
    `\`${p} yardim sosyal\` — kiss hug punch…`,
  ].join('\n');

  // L5 — yeni oyuncunun kaybolmaması için keşif önerileri.
  // Dil "istersen" tonunda: görev listesi değil, merak kapısı.
  const curiosities = [
    `\`${p} zoo\` — kaç av türü keşfettin?`,
    `\`${p} evrim\` — baykuşun ay evrimi nereye gidiyor?`,
    `\`${p} yardim drop\` — kutu oranları ve pity açıkça yazıyor`,
    `\`${p} hunt\` — avlan · encounter'da **Evcilleştir**`,
    `\`${p} market\` — başka oyuncular ne satıyor?`,
  ].join('\n');

  return new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle('🦉 OwlHunt Rehberi')
    .setDescription(`Komutlar: \`${p} <komut>\``)
    .addFields(
      { name: '🎮 Nasıl oynanır', value: economyLoop, inline: false },
      { name: '🚀 Başlangıç komutları', value: start, inline: false },
      { name: '🔎 Merak edersen', value: curiosities, inline: false },
      { name: '📂 Detay kategorileri', value: topics, inline: false },
    )
    .setFooter({ text: `${buildHelpDiscordFooter()} · Kısayol: h av · s slot · st stats · sl / ws sat` });
}

function buildHelpTopicEmbed(prefix: string, topic: string): EmbedBuilder {
  const p = prefix;
  const label = HELP_TOPIC_LABELS[topic] ?? topic;

  // Drop oranları config'ten türetilir — statik metin tutulamaz (A4).
  if (topic === 'drop') return buildDropRatesEmbed(prefix);

  const sections: Record<string, string> = {
    av: [
      `\`${p} hunt\` · \`${p} h\` — avlan`,
      `\`${p} sell all\` · \`${p} sl all\` — avları coin'e çevir`,
      `\`${p} parçala all\` · \`${p} parçala <av>\` — avdan upgrade materyali`,
      `\`${p} hunt\` sonrası **Evcilleştir** butonu — yabani baykuş`,
      `\`${p} stats\` · \`${p} st\` — istatistik & Verim`,
      `\`${p} evrim\` — ay evrimi ilerlemesi`,
      `\`${p} owls\` — koleksiyon vitrini · \`${p} owllist\` ID listesi`,
      `\`${p} zoo\` · \`${p} z\` — av hayvanat bahçesi`,
      `\`${p} upgrade <stat>\` · \`${p} up gaga\` — stat geliştir`,
      `\`${p} setmain <id>\` · \`${p} sm\` — main değiştir`,
      `\`${p} owl name <isim>\` — takma ad`,
      '',
      '**Statlar:** gaga · goz · kulak · kanat · pence',
      '',
      '🏁 **Av serisi:** 25 · 50 · 80 … avda XP çarpanı + kutu. Ara verirsen sessizce sıfırlanır.',
      '🌱 İlk **7 gün** yeni oyuncu bonusu görünür; seriler cezalandırmaz.',
    ].join('\n'),

    esya: [
      `\`${p} inventory\` · \`${p} inv\` — envanter (rünler, buff, materyal)`,
      `\`${p} use <id>\` · \`${p} u 001\` — buff tak (max 3 aktif)`,
      `\`${p} use\` — aktif buff listesi`,
      `\`${p} sk\` / \`${p} ek\` — kutu aç (\`all\` = hepsi)`,
      `\`${p} aç\` — kutu envanteri`,
      `\`${p} parçala\` — envanterindeki parçalanabilir avlar`,
      `\`${p} parçala stat\` — tüm parçalama tarifleri`,
      `\`${p} parçala all\` — tüm parçalanabilir avları parçala`,
      `\`${p} parçala fare\` — fare → Kemik Tozu vb.`,
      `\`${p} dismantle <av>\` — parçala (İng. alias)`,
      `\`${p} katalog\` · \`${p} k\` — buff & materyal rehberi`,
      `\`${p} katalog defter\` — av koleksiyonu + ipuçları`,
      `\`${p} katalog rün\` — rün kataloğu`,
      `\`${p} rün\` · \`${p} run\` — rün envanteri · \`${p} rün 040\` uygula`,
      `\`${p} yardim drop\` — kutu oranları + pity eşikleri`,
      '',
      '**Parçalama ipucu:** Coin yerine materyal istiyorsan `sell all` değil `parçala` kullan.',
    ].join('\n'),

    pvp: [
      `\`${p} vs <@oyuncu>\` — oyuncuya meydan oku (XP, loot)`,
      `\`${p} duel\` · \`${p} d\` — bot ile duel`,
      `\`${p} duelbet @oyuncu <bahis|all>\` — bahisli düello`,
      `Davetler **35 sn** geçerli · Kaybeden Verim kaybedebilir`,
      '',
      `💰 Duel coin kazancı günlük **${DUEL_DAILY_COIN_CAP}**'e kadar tam gelir; ` +
      `sonrasında durmaz, azalarak devam eder. XP hiç etkilenmez.`,
    ].join('\n'),

    ekonomi: [
      `\`${p} cash\` · \`${p} c\` — bakiye`,
      `\`${p} xp\` — seviye ilerlemesi`,
      `\`${p} sell all\` · \`${p} sl all\` — av sat → coin`,
      `\`${p} parçala all\` · \`${p} parçala <av>\` — av parçala → materyal`,
      `\`${p} ver @kullanıcı <miktar>\` — coin gönder`,
      `\`${p} lb\` · \`${p} top\` — liderboard`,
      `\`${p} quest\` · \`${p} q\` · \`${p} quests\` — günlük görev (günde **4**)`,
      `\`${p} daily\` · \`${p} wdaily\` — günlük giriş hediyesi`,
      `\`${p} kudos\` — kaç kişi attı · \`${p} kudos @oyuncu\` — 20 dk'da bir`,
      `\`${p} mentor ol\` / \`${p} mentor iste\` — rehber bağı`,
      `\`${p} telafi\` — stat rebalance telafisi`,
    ].join('\n'),

    market: [
      `\`${p} market\` · \`${p} m\` — Baykuş Pazarı (menü)`,
      `\`${p} trade @oyuncu\` · \`${p} takas @oyuncu\` — P2P trade`,
      `\`${p} trade log\` — kendi trade geçmişin`,
      `\`${p} pazar <kelime>\` — satıcı veya ürün ara`,
      `\`${p} sat <eşya> <fiyat>\` — oyuncular arası satış`,
      `\`${p} buy <no>\` — ilandan satın al`,
      `\`${p} msell\` — pazar satış alias`,
    ].join('\n'),

    kumar: [
      `\`${p} cf <miktar|all>\` — yazı tura (min 100)`,
      `\`${p} cf yazi 500\` / \`${p} cf tura all\` — seçimli`,
      `\`${p} bj <miktar|all>\` — gölge 21 (solo)`,
      `\`${p} slot <miktar|all>\` — ganimet makinesi (3'lü eşleşme)`,
      `\`${p} cf/bj/slot @oyuncu <miktar|all>\` — PvP kumar`,
      `\`${p} duelbet @oyuncu <bahis|all>\` — bahisli düello`,
      `\`${p} kumar\` — solo + PvP kumar tanıtımı`,
      `Slot: baykuş x9 · elmas x4 · coin x2 · poop x0`,
      `Kasa payı davet ekranında gösterilir`,
    ].join('\n'),

    ipucu: [
      `• **Ekonomi döngüsü:** hunt → sell all (coin) veya parçala (materyal) → upgrade`,
      `• \`${p} parçala\` yazınca envanterindeki parçalanabilir avlar çıkar`,
      `• \`${p} parçala stat\` — tüm av tarifleri`,
      `• Upgrade **garanti +1** — maliyet yükseldikçe artar`,
      `• Statlar arası max **20** fark (görünen statlar)`,
      `• Av, main değişimi ve bazı işlemlerde cooldown var`,
      `• Lootbox hunt, PvP ve encounter'dan düşer`,
      `• \`${p} upgrade\` yazınca stat kilitleri görünür`,
      `• Toplu: \`${p} up gaga 10\` veya \`${p} up kanat all\``,
      `• Sunucu admin: \`${p} owlonly\` ile oyun kanalı sınırı`,
    ].join('\n'),

    build: [
      `**Gaga** — PvP / düello hasarı (ATK)`,
      `**Pençe** — yakalama + savunma (DEF)`,
      `**Göz** — av yakalama, keşif, kritik (CRT)`,
      `**Kulak** — keşif ve evcilleştirme`,
      `**Kanat** — stamina ve hız (SPD)`,
      ``,
      `Güç profildeki sayı ile düellodaki ATK·DEF·SPD·CRT aynı kaynaktan gelir.`,
      `Bond ve daha güçlü tür (main) gücü artırır.`,
      `\`${p} stats\` her satırın ne işe yaradığını gösterir.`,
    ].join('\n'),

    sosyal: [
      `\`${p} kiss @kisi\` — öpücük`,
      `\`${p} hug @kisi\` — sarıl`,
      `\`${p} love @kisi\` — sevgi`,
      `\`${p} cuddle @kisi\` — kucakla`,
      `\`${p} punch @kisi\` · \`${p} punc\` — yumruk`,
      `\`${p} slap @kisi\` — tokat`,
      `\`${p} pat @kisi\` — kafa okşa`,
      `\`${p} poke @kisi\` — dürt`,
      `\`${p} wave @kisi\` — el salla`,
      `\`${p} highfive @kisi\` · \`${p} hf\` — çak`,
    ].join('\n'),
  };

  const body = sections[topic];
  if (!body) return buildHelpUnknownTopicEmbed(prefix, topic);

  return new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(label)
    .setDescription(body)
    .setFooter({ text: `Ana menü: \`${p} yardim\` · ${buildHelpDiscordFooter()}` });
}

function buildHelpUnknownTopicEmbed(prefix: string, topic: string): EmbedBuilder {
  const p = prefix;
  const list = Object.entries(HELP_TOPIC_LABELS)
    .map(([key, label]) => `\`${p} yardim ${key}\` — ${label}`)
    .join('\n');

  return new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle('❓ Bilinmeyen kategori')
    .setDescription(`**\`${topic}\`** bulunamadı.\n\n${list}`)
    .setFooter({ text: `Ana menü: \`${p} yardim\`` });
}

export function buildHelpEmbed(prefix: string, topicRaw?: string | null): EmbedBuilder {
  if (!topicRaw?.trim()) return buildHelpHubEmbed(prefix);
  const topic = resolveHelpTopic(topicRaw);
  if (!topic) return buildHelpUnknownTopicEmbed(prefix, topicRaw.trim());
  return buildHelpTopicEmbed(prefix, topic);
}

export async function buildHelpEmbedWithLost(
  redis: Redis,
  userId: string,
  prefix: string,
  topicRaw?: string | null,
): Promise<EmbedBuilder> {
  const topic = resolveHelpTopic(topicRaw);
  const key = topic ? `yardim:${topic}` : 'yardim';
  return embedWithLostFooterIfNeeded(redis, userId, key, buildHelpEmbed(prefix, topic));
}

export async function runYardimMessage(
  message: Message,
  args: string[],
  redis: Redis,
  userId: string,
  prefix: string,
): Promise<void> {
  const embed = await buildHelpEmbedWithLost(redis, userId, prefix, args[0]);
  await message.reply({ embeds: [embed] });
}
