import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { COIN_EMOJI, formatCoinLabel, formatXpLabel, XP_EMOJI } from '../config/ui-emojis';
import { chargeBadge } from '../utils/theme';
import type { CommandDefinition } from '../types';
import { LEADERBOARD_SEASON_RESET_ENABLED, LEADERBOARD_ROLE_STEAL_CHANNEL_ID, MAIN_GUILD_ID } from '../config';
import { archiveAndResetSeason, getCurrentSeason, invalidateLeaderboardCache, refreshPowerScore, backfillLeaderboardStats } from '../systems/leaderboard';
import {
  announceRoleSteals,
  buildRoleStealEmbed,
  buildRoleStealEvent,
  createLeaderboardRoles,
  syncAllRoles,
} from '../systems/roles';
import { handleTestTame } from './admin-testtame';
import { handleTestMoon } from './admin-testmoon';
import { undoLastAction } from '../utils/audit';
import {
  buildOwlStatWriteData,
  getBaseStats,
  getTrainedStats,
} from '../utils/owl-stats';
import type { OwlStatKey } from '../types';
import {
  applyCoinDeltaInRedis,
  rehydratePlayerState,
  refreshPlayerCoinsInRedis,
} from '../state/player-state';
import { assertSafeEconomyAmount } from '../utils/safe-economy-amount';
import { displayBuffEmoji } from '../config/custom-emojis';
import { runWithFinancialLocks } from '../systems/economy-transaction-manager';
import { withLock } from '../utils/lock';
import { clearCooldown, clearCooldownPattern } from '../middleware/cooldown-manager';
import {
  isAdmin,
  MAINTENANCE_KEY,
} from '../utils/admin-access';
import {
  buildHuntHotPathReport,
  forceFlushHuntHotPathMetrics,
  getLatestHuntHotPathSnapshot,
  getPendingHuntSampleCount,
  isHuntHotPathMetricsEnabled,
} from '../utils/hunt-hotpath-metrics.js';

const ADMIN_STAT_FIELD: Record<string, OwlStatKey> = {
  statGaga: 'gaga',
  statGoz: 'goz',
  statKulak: 'kulak',
  statKanat: 'kanat',
  statPence: 'pence',
};

const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Admin komutlari')
  .setDMPermission(false)
  // ── player grubu ─────────────────────────────────────────────────────────
  .addSubcommandGroup((g) => g.setName('player').setDescription('Oyuncu yönetimi')
    .addSubcommand((s) => s.setName('stats').setDescription('Oyuncu detaylı bilgi')
      .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true)))
    .addSubcommand((s) => s.setName('reset').setDescription('Oyuncuyu sıfırla (level/xp/coin/streak)')
      .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true)))
    .addSubcommand((s) => s.setName('setlevel').setDescription('Seviye ayarla')
      .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true))
      .addIntegerOption((o) => o.setName('seviye').setDescription('Yeni seviye').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName('setcoins').setDescription('Coin miktarını direkt ayarla')
      .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true))
      .addIntegerOption((o) => o.setName('miktar').setDescription('Coin miktari').setRequired(true).setMinValue(0)))
    .addSubcommand((s) => s.setName('addcoins').setDescription('Coin ekle')
      .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true))
      .addIntegerOption((o) => o.setName('miktar').setDescription('Miktar').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName('addxp').setDescription('XP ekle')
      .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true))
      .addIntegerOption((o) => o.setName('miktar').setDescription('Miktar').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName('setprestige').setDescription('Prestige seviyesini ayarla')
      .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true))
      .addIntegerOption((o) => o.setName('seviye').setDescription('Prestige seviyesi').setRequired(true).setMinValue(0)))
    .addSubcommand((s) => s.setName('transfercoins').setDescription('İki oyuncu arasında coin aktar')
      .addUserOption((o) => o.setName('gonderen').setDescription('Gönderen oyuncu').setRequired(true))
      .addUserOption((o) => o.setName('alan').setDescription('Alan oyuncu').setRequired(true))
      .addIntegerOption((o) => o.setName('miktar').setDescription('Coin miktarı').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName('delete').setDescription('Oyuncuyu tamamen sil (GERİ ALINAMAZ)')
      .addUserOption((o) => o.setName('kullanici').setDescription('Silinecek oyuncu').setRequired(true)))
    .addSubcommand((s) => s.setName('undo').setDescription('Oyuncunun son işlemini geri al')
      .addStringOption((o) => o.setName('userid').setDescription('Oyuncu Discord ID\'si').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Kayıtlı oyuncuları listele')
      .addIntegerOption((o) => o.setName('sayfa').setDescription('Sayfa numarası').setRequired(false).setMinValue(1)))
  )
  // ── owl grubu ─────────────────────────────────────────────────────────────
  .addSubcommandGroup((g) => g.setName('owl').setDescription('Baykuş yönetimi')
    .addSubcommand((s) => s.setName('heal').setDescription('Main baykuşu tam HP yap')
      .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true)))
    .addSubcommand((s) => s.setName('setstat').setDescription('Baykuş statını ayarla')
      .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true))
      .addStringOption((o) => o.setName('stat').setDescription('Stat').setRequired(true).addChoices(
        { name: 'gaga', value: 'statGaga' }, { name: 'goz', value: 'statGoz' },
        { name: 'kulak', value: 'statKulak' }, { name: 'kanat', value: 'statKanat' },
        { name: 'pence', value: 'statPence' },
      ))
      .addIntegerOption((o) => o.setName('deger').setDescription('Yeni değer').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName('reset').setDescription('Main baykuşun statlarını sıfırla')
      .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true)))
    .addSubcommand((s) => s.setName('give').setDescription('Oyuncuya yeni baykuş ver')
      .addUserOption((o) => o.setName('kullanici').setDescription('Oyuncu').setRequired(true))
      .addIntegerOption((o) => o.setName('tier').setDescription('Tier (1-8)').setRequired(true).setMinValue(1).setMaxValue(8))
      .addStringOption((o) => o.setName('kalite').setDescription('Kalite').setRequired(true).addChoices(
        { name: 'Trash', value: 'Trash' }, { name: 'Common', value: 'Common' },
        { name: 'Good', value: 'Good' }, { name: 'Rare', value: 'Rare' },
        { name: 'Elite', value: 'Elite' }, { name: 'God Roll', value: 'God Roll' },
      )))
    .addSubcommand((s) => s.setName('setquality').setDescription('Main baykuşun kalitesini değiştir')
      .addUserOption((o) => o.setName('kullanici').setDescription('Oyuncu').setRequired(true))
      .addStringOption((o) => o.setName('kalite').setDescription('Kalite').setRequired(true).addChoices(
        { name: 'Trash', value: 'Trash' }, { name: 'Common', value: 'Common' },
        { name: 'Good', value: 'Good' }, { name: 'Rare', value: 'Rare' },
        { name: 'Elite', value: 'Elite' }, { name: 'God Roll', value: 'God Roll' },
      )))
    .addSubcommand((s) => s.setName('seteffectiveness').setDescription('Effectiveness değerini ayarla')
      .addUserOption((o) => o.setName('kullanici').setDescription('Oyuncu').setRequired(true))
      .addIntegerOption((o) => o.setName('deger').setDescription('Değer (0-100)').setRequired(true).setMinValue(0).setMaxValue(100)))
    .addSubcommand((s) => s.setName('setpassivemode').setDescription('Pasif modunu ayarla')
      .addUserOption((o) => o.setName('kullanici').setDescription('Oyuncu').setRequired(true))
      .addStringOption((o) => o.setName('mod').setDescription('Mod').setRequired(true).addChoices(
        { name: 'idle', value: 'idle' }, { name: 'training', value: 'training' },
      )))
  )
  // ── inv grubu ─────────────────────────────────────────────────────────────
  .addSubcommandGroup((g) => g.setName('inv').setDescription('Envanter yönetimi')
    .addSubcommand((s) => s.setName('add').setDescription('Item ekle')
      .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true))
      .addStringOption((o) => o.setName('item').setDescription('Item adi').setRequired(true))
      .addIntegerOption((o) => o.setName('miktar').setDescription('Miktar').setRequired(true).setMinValue(1))
      .addStringOption((o) => o.setName('tip').setDescription('Item tipi').addChoices(
        { name: 'Materyal', value: 'Materyal' }, { name: 'Av', value: 'Av' },
      )))
    .addSubcommand((s) => s.setName('remove').setDescription('Envanterden item sil')
      .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true))
      .addStringOption((o) => o.setName('item').setDescription('Item adi').setRequired(true)))
    .addSubcommand((s) => s.setName('clear').setDescription('Envanteri tamamen temizle')
      .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true)))
    .addSubcommand((s) => s.setName('view').setDescription('Oyuncunun envanterini görüntüle')
      .addUserOption((o) => o.setName('kullanici').setDescription('Oyuncu').setRequired(true)))
    .addSubcommand((s) => s.setName('givebuff').setDescription('Envantere buff item ekle')
      .addUserOption((o) => o.setName('kullanici').setDescription('Oyuncu').setRequired(true))
      .addStringOption((o) => o.setName('buffid').setDescription('Buff ID (b001-b012)').setRequired(true))
      .addIntegerOption((o) => o.setName('miktar').setDescription('Miktar').setRequired(false).setMinValue(1).setMaxValue(99)))
    .addSubcommand((s) => s.setName('givelootbox').setDescription('Lootbox ver')
      .addUserOption((o) => o.setName('kullanici').setDescription('Oyuncu').setRequired(true))
      .addStringOption((o) => o.setName('tip').setDescription('Kutu tipi').setRequired(true).addChoices(
        { name: 'Silah Kutusu', value: 'Silah Kutusu' },
        { name: 'Eşya Kutusu', value: 'Eşya Kutusu' },
      ))
      .addIntegerOption((o) => o.setName('miktar').setDescription('Miktar').setRequired(false).setMinValue(1).setMaxValue(99)))
    .addSubcommand((s) => s.setName('givebuffactive').setDescription('Oyuncuya aktif buff tak')
      .addUserOption((o) => o.setName('kullanici').setDescription('Oyuncu').setRequired(true))
      .addStringOption((o) => o.setName('buffid').setDescription('Buff ID (b001-b012)').setRequired(true)))
    .addSubcommand((s) => s.setName('clearbuffs').setDescription('Tüm aktif buff\'ları temizle')
      .addUserOption((o) => o.setName('kullanici').setDescription('Oyuncu').setRequired(true)))
    .addSubcommand((s) => s.setName('listbuffs').setDescription('Aktif buff\'ları listele')
      .addUserOption((o) => o.setName('kullanici').setDescription('Oyuncu').setRequired(true)))
  )
  // ── sys grubu ─────────────────────────────────────────────────────────────
  .addSubcommandGroup((g) => g.setName('sys').setDescription('Sistem yönetimi')
    .addSubcommand((s) => s.setName('info').setDescription('Sunucu istatistikleri'))
    .addSubcommand((s) => s.setName('perf').setDescription('Komut performans raporu (son 5 dk)'))
    .addSubcommand((s) => s.setName('huntperf').setDescription('Hunt hot-path performans raporu'))
    .addSubcommand((s) => s.setName('ops').setDescription('Operasyonel özet (read-only)')
      .addStringOption((o) => o.setName('view').setDescription('Görünüm').setRequired(true).addChoices(
        { name: 'System', value: 'system' },
        { name: 'Traffic', value: 'traffic' },
        { name: 'Abuse', value: 'abuse' },
        { name: 'Infra', value: 'infra' },
      )))
    .addSubcommand((s) => s.setName('maintenance').setDescription('Bakım modunu aç/kapat'))
    .addSubcommand((s) => s.setName('broadcast').setDescription('Tüm oyunculara duyuru gönder')
      .addStringOption((o) => o.setName('baslik').setDescription('Embed başlığı').setRequired(true))
      .addStringOption((o) => o.setName('mesaj').setDescription('Mesaj gövdesi (alt satır: Enter veya \\n, liste: - madde)').setRequired(true))
      .addStringOption((o) => o.setName('footer').setDescription('Alt bilgi').setRequired(false))
      .addStringOption((o) => o.setName('renk').setDescription('Renk').setRequired(false).addChoices(
        { name: '🔵 Mavi', value: 'blue' }, { name: '🟢 Yeşil', value: 'green' },
        { name: '🟡 Sarı', value: 'yellow' }, { name: '🔴 Kırmızı', value: 'red' },
        { name: '🟣 Mor', value: 'purple' },
      )))
    .addSubcommand((s) => s.setName('clearcooldown').setDescription('Hunt cooldown temizle')
      .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true)))
    .addSubcommand((s) => s.setName('clearallcooldowns').setDescription('TÜM hunt cooldownları temizle'))
    .addSubcommand((s) => s.setName('clearupgradecooldown').setDescription('Upgrade cooldown temizle')
      .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true)))
    .addSubcommand((s) => s.setName('testtame').setDescription('Encounter oluştur ve tame UI başlat')
      .addIntegerOption((o) => o.setName('tier').setDescription('Baykuş tier (1-8)').setRequired(true).setMinValue(1).setMaxValue(8))
      .addStringOption((o) => o.setName('kalite').setDescription('Kalite').addChoices(
        { name: 'Trash', value: 'Trash' }, { name: 'Common', value: 'Common' },
        { name: 'Good', value: 'Good' }, { name: 'Rare', value: 'Rare' },
        { name: 'Elite', value: 'Elite' }, { name: 'God Roll', value: 'God Roll' },
      ))
      .addUserOption((o) => o.setName('kullanici').setDescription('Hedef oyuncu (boş = kendin)')))
    .addSubcommand((s) => s.setName('testmoon').setDescription('Ay evrimi bildirimi önizle (DB\'ye dokunmaz)')
      .addUserOption((o) => o.setName('kullanici').setDescription('Etiketlenecek oyuncu (boş = kendin)'))
      .addIntegerOption((o) => o.setName('eski').setDescription('Eski moon kademesi (varsayılan: 1)').setMinValue(1).setMaxValue(6))
      .addIntegerOption((o) => o.setName('yeni').setDescription('Yeni moon kademesi (varsayılan: 2)').setMinValue(2).setMaxValue(7))
      .addIntegerOption((o) => o.setName('tur').setDescription('Tür tier (1-8), boş = main baykuş').setMinValue(1).setMaxValue(8))
      .addIntegerOption((o) => o.setName('guc').setDescription('Güç değeri (boş = otomatik)').setMinValue(0).setMaxValue(500))
      .addStringOption((o) => o.setName('isim').setDescription('Baykuş adı (boş = main nickname/tür)')))
  )
  // ── lb grubu ──────────────────────────────────────────────────────────────
  .addSubcommandGroup((g) => g.setName('lb').setDescription('Liderboard yönetimi')
    .addSubcommand((s) => s.setName('siralama').setDescription('Liderboard rollerini oluştur'))
    .addSubcommand((s) => s.setName('syncroles').setDescription('Liderboard rollerini sıralamaya göre ata'))
    .addSubcommand((s) => s.setName('testduyuru').setDescription('Rol çalma duyurusunu test et (kanala gönderir)')
      .addStringOption((o) => o.setName('kategori').setDescription('Liderboard kategorisi').setRequired(true).addChoices(
        { name: 'Güç — 👑 İmparator', value: 'power' },
        { name: 'Arena — Arenanın babası', value: 'arena' },
        { name: 'Servet — Altın Baronu', value: 'wealth' },
      ))
      .addUserOption((o) => o.setName('yeni').setDescription('Yeni rol sahibi (kazanan)').setRequired(true))
      .addUserOption((o) => o.setName('eski').setDescription('Eski rol sahibi (kaybeden)').setRequired(true))
      .addBooleanOption((o) => o.setName('dm').setDescription('Oyunculara DM de gönder (varsayılan: hayır)').setRequired(false)))
    .addSubcommand((s) => s.setName('cache').setDescription('Liderboard cache\'ini temizle'))
    .addSubcommand((s) => s.setName('season').setDescription('Mevcut sezon bilgisi'))
    .addSubcommand((s) => s.setName('reset').setDescription('Sezonu arşivle ve sıfırla (GERİ ALINAMAZ)'))
    .addSubcommand((s) => s.setName('refreshscore').setDescription('Oyuncunun power score\'unu yenile')
      .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true)))
    .addSubcommand((s) => s.setName('backfill').setDescription('Tüm oyuncuların liderboard verisini yenile'))
  )
  // ── rollback grubu ────────────────────────────────────────────────────────
  .addSubcommandGroup((g) => g.setName('rollback').setDescription('Sell rollback (1s / 1g / 1h)')
    .addSubcommand((s) => s.setName('sell-onizle').setDescription('Sell rollback önizle')
      .addStringOption((o) => o.setName('donem').setDescription('Pencere').setRequired(true).addChoices(
        { name: 'Son 1 saat', value: '1h' },
        { name: '1 gün (UTC)', value: '1d' },
        { name: '1 hafta (UTC)', value: '1w' },
      ))
      .addStringOption((o) => o.setName('tarih').setDescription('YYYY-MM-DD (1d/1w için, boş = bugün)').setRequired(false)))
    .addSubcommand((s) => s.setName('sell-uygula').setDescription('Sell rollback uygula')
      .addStringOption((o) => o.setName('donem').setDescription('Pencere').setRequired(true).addChoices(
        { name: 'Son 1 saat', value: '1h' },
        { name: '1 gün (UTC)', value: '1d' },
        { name: '1 hafta (UTC)', value: '1w' },
      ))
      .addBooleanOption((o) => o.setName('onay').setDescription('Onay (true olmadan uygulanmaz)').setRequired(true))
      .addStringOption((o) => o.setName('tarih').setDescription('YYYY-MM-DD (1d/1w için)').setRequired(false)))
    .addSubcommand((s) => s.setName('sell-kayit').setDescription('Sell kayıt istatistikleri (retention)'))
  )
  // ── stats grubu ───────────────────────────────────────────────────────────
  .addSubcommandGroup((g) => g.setName('stats').setDescription('İstatistikler')
    .addSubcommand((s) => s.setName('economy').setDescription('Ekonomi istatistikleri'))
    .addSubcommand((s) => s.setName('buffs').setDescription('Buff kullanım istatistikleri'))
    .addSubcommand((s) => s.setName('pvp').setDescription('PvP istatistikleri'))
    .addSubcommand((s) => s.setName('market').setDescription('Market istatistikleri'))
    .addSubcommand((s) => s.setName('quests').setDescription('Günlük görev istatistikleri'))
  );

async function execute(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  if (!isAdmin(interaction.user.id)) {
    await interaction.reply({ content: '❌ Bu komutu sadece bot sahibi kullanabilir.', flags: 64 });
    return;
  }

  const sub = interaction.options.getSubcommand(true);
  const grp = interaction.options.getSubcommandGroup(false) ?? '';

  // ── player/stats ───────────────────────────────────────────────────────────
  if (grp === 'player' && sub === 'stats') {
    const user = interaction.options.getUser('kullanici', true);
    const player = await ctx.prisma.player.findUnique({ where: { id: user.id } });
    if (!player) { await interaction.reply({ content: `❌ <@${user.id}> kayıtlı değil.`, flags: 64 }); return; }

    const owl = await ctx.prisma.owl.findFirst({ where: { ownerId: user.id, isMain: true } });
    const owlCount = await ctx.prisma.owl.count({ where: { ownerId: user.id } });
    const itemCount = await ctx.prisma.inventoryItem.count({ where: { ownerId: user.id } });

    let t = `📊 **Admin Stats — <@${user.id}>**\n\n`;
    t += `👤 Level: **${player.level}** | ${formatXpLabel(player.xp)} | ${formatCoinLabel(player.coins)}\n`;
    t += `🦉 Baykuş: **${owlCount}** | 📦 Item: **${itemCount}** | 🔥 Streak: **${player.huntComboStreak}**\n`;
    if (owl) {
      t += `\n🦉 **Main:** ${owl.species} | HP: ${owl.hp}/${owl.hpMax} | Quality: ${owl.quality}\n`;
      t += `⚔️ Gaga:${owl.statGaga} Göz:${owl.statGoz} Kulak:${owl.statKulak} Kanat:${owl.statKanat} Pençe:${owl.statPence}`;
    }
    await interaction.reply({ content: t, flags: 64 });
    return;
  }

  // ── player/reset ──────────────────────────────────────────────────────────
  if (grp === 'player' && sub === 'reset') {
    const user = interaction.options.getUser('kullanici', true);
    const player = await ctx.prisma.player.findUnique({ where: { id: user.id } });
    if (!player) { await interaction.reply({ content: `❌ <@${user.id}> kayıtlı değil.`, flags: 64 }); return; }

    await ctx.prisma.player.update({
      where: { id: user.id },
      data: { level: 1, xp: 0, coins: 0, huntComboStreak: 0, pvpStreak: 0, pvpStreakLoss: 0, gambleStreakWins: 0, gambleStreakLosses: 0 },
    });
    await interaction.reply({ content: `✅ <@${user.id}> sıfırlandı. (level/xp/coin/streak)`, flags: 64 });
    return;
  }

  // ── player/setlevel ────────────────────────────────────────────────────────
  if (grp === 'player' && sub === 'setlevel') {
    const user = interaction.options.getUser('kullanici', true);
    const level = interaction.options.getInteger('seviye', true);
    const player = await ctx.prisma.player.findUnique({ where: { id: user.id } });
    if (!player) { await interaction.reply({ content: `❌ <@${user.id}> kayıtlı değil.`, flags: 64 }); return; }

    await ctx.prisma.player.update({ where: { id: user.id }, data: { level, xp: 0 } });
    await interaction.reply({ content: `✅ <@${user.id}> seviyesi **${level}** olarak ayarlandı. 🎯`, flags: 64 });
    return;
  }

  // ── player/setcoins ────────────────────────────────────────────────────────
  if (grp === 'player' && sub === 'setcoins') {
    const user = interaction.options.getUser('kullanici', true);
    const amount = interaction.options.getInteger('miktar', true);
    const player = await ctx.prisma.player.findUnique({ where: { id: user.id } });
    if (!player) { await interaction.reply({ content: `❌ <@${user.id}> kayıtlı değil.`, flags: 64 }); return; }

    assertSafeEconomyAmount(amount, 'Coin');
    await ctx.prisma.player.update({ where: { id: user.id }, data: { coins: amount } });
    await refreshPlayerCoinsInRedis(ctx.redis, ctx.prisma, user.id);
    await interaction.reply({ content: `✅ <@${user.id}> ${formatCoinLabel(amount)}`, flags: 64 });
    return;
  }

  // ── player/addcoins ────────────────────────────────────────────────────────
  if (grp === 'player' && sub === 'addcoins') {
    const user = interaction.options.getUser('kullanici', true);
    const amount = interaction.options.getInteger('miktar', true);
    if (amount < 1) {
      await interaction.reply({ content: '❌ Miktar en az **1** olmalı.', flags: 64 });
      return;
    }
    assertSafeEconomyAmount(amount, 'Coin');
    const player = await ctx.prisma.player.findUnique({ where: { id: user.id } });
    if (!player) { await interaction.reply({ content: `❌ <@${user.id}> kayıtlı değil.`, flags: 64 }); return; }

    await ctx.prisma.player.update({ where: { id: user.id }, data: { coins: { increment: amount } } });
    await withLock(user.id, 'financial', () =>
      applyCoinDeltaInRedis(ctx.redis, user.id, amount, ctx.prisma),
    );
    await interaction.reply({ content: `✅ <@${user.id}> ${formatCoinLabel(amount)} eklendi.`, flags: 64 });
    return;
  }

  // ── player/addxp ───────────────────────────────────────────────────────────
  if (grp === 'player' && sub === 'addxp') {
    const user = interaction.options.getUser('kullanici', true);
    const amount = interaction.options.getInteger('miktar', true);
    if (amount < 1) {
      await interaction.reply({ content: '❌ Miktar en az **1** olmalı.', flags: 64 });
      return;
    }
    const player = await ctx.prisma.player.findUnique({ where: { id: user.id } });
    if (!player) { await interaction.reply({ content: `❌ <@${user.id}> kayıtlı değil.`, flags: 64 }); return; }

    await ctx.prisma.player.update({ where: { id: user.id }, data: { xp: { increment: amount } } });
    await interaction.reply({ content: `✅ <@${user.id}> ${formatXpLabel(amount)} eklendi.`, flags: 64 });
    return;
  }

  // ── owl/heal ───────────────────────────────────────────────────────────────
  if (grp === 'owl' && sub === 'heal') {
    const user = interaction.options.getUser('kullanici', true);
    const owl = await ctx.prisma.owl.findFirst({ where: { ownerId: user.id, isMain: true } });
    if (!owl) { await interaction.reply({ content: `❌ <@${user.id}> main baykusu yok.`, flags: 64 }); return; }

    await ctx.prisma.owl.update({ where: { id: owl.id }, data: { hp: owl.hpMax, staminaCur: owl.hpMax } });
    await interaction.reply({ content: `✅ <@${user.id}> baykuşu tam HP/Stamina. ❤️`, flags: 64 });
    return;
  }

  // ── owl/setstat ────────────────────────────────────────────────────────────
  if (grp === 'owl' && sub === 'setstat') {
    const user = interaction.options.getUser('kullanici', true);
    const stat = interaction.options.getString('stat', true);
    const value = interaction.options.getInteger('deger', true);
    const owl = await ctx.prisma.owl.findFirst({ where: { ownerId: user.id, isMain: true } });
    if (!owl) { await interaction.reply({ content: `❌ <@${user.id}> main baykusu yok.`, flags: 64 }); return; }

    const key = ADMIN_STAT_FIELD[stat];
    if (!key) {
      await interaction.reply({ content: `❌ Geçersiz stat alanı: ${stat}`, flags: 64 });
      return;
    }
    const base = getBaseStats(owl);
    const trained = getTrainedStats(owl);
    base[key] = value;
    trained[key] = 0;
    await ctx.prisma.owl.update({
      where: { id: owl.id },
      data: buildOwlStatWriteData(base, trained),
    });
    if (ctx.redis) {
      await rehydratePlayerState(ctx.redis, ctx.prisma, user.id);
    }
    await interaction.reply({ content: `✅ <@${user.id}> **${stat}** → **${value}** (eğitim sıfırlandı). ⚡`, flags: 64 });
    return;
  }

  // ── owl/reset ──────────────────────────────────────────────────────────────
  if (grp === 'owl' && sub === 'reset') {
    const user = interaction.options.getUser('kullanici', true);
    const owl = await ctx.prisma.owl.findFirst({ where: { ownerId: user.id, isMain: true } });
    if (!owl) { await interaction.reply({ content: `❌ <@${user.id}> main baykusu yok.`, flags: 64 }); return; }

    await ctx.prisma.owl.update({
      where: { id: owl.id },
      data: {
        ...buildOwlStatWriteData({ gaga: 1, goz: 1, kulak: 1, kanat: 1, pence: 1 }),
        bond: 0,
        hp: owl.hpMax,
        staminaCur: owl.hpMax,
      },
    });
    await interaction.reply({ content: `✅ <@${user.id}> baykuş statları sıfırlandı. 🦉`, flags: 64 });
    return;
  }

  // ── inv/add ────────────────────────────────────────────────────────────────
  if (grp === 'inv' && sub === 'add') {
    const user = interaction.options.getUser('kullanici', true);
    const itemName = interaction.options.getString('item', true);
    const quantity = interaction.options.getInteger('miktar', true);
    const itemType = interaction.options.getString('tip') ?? 'Materyal';

    const existing = await ctx.prisma.inventoryItem.findFirst({ where: { ownerId: user.id, itemName } });
    if (existing) {
      await ctx.prisma.inventoryItem.update({ where: { id: existing.id }, data: { quantity: { increment: quantity } } });
    } else {
      await ctx.prisma.inventoryItem.create({
        data: { ownerId: user.id, itemName, itemType, rarity: 'Common', quantity },
      });
    }
    await interaction.reply({ content: `✅ <@${user.id}> +${quantity}x **${itemName}** eklendi. 📦`, flags: 64 });
    return;
  }

  // ── inv/remove ─────────────────────────────────────────────────────────────
  if (grp === 'inv' && sub === 'remove') {
    const user = interaction.options.getUser('kullanici', true);
    const itemName = interaction.options.getString('item', true);
    const item = await ctx.prisma.inventoryItem.findFirst({ where: { ownerId: user.id, itemName } });
    if (!item) { await interaction.reply({ content: `❌ <@${user.id}> envanterinde **${itemName}** yok.`, flags: 64 }); return; }

    await ctx.prisma.inventoryItem.delete({ where: { id: item.id } });
    await interaction.reply({ content: `✅ <@${user.id}> envanterinden **${itemName}** silindi. 🗑️`, flags: 64 });
    return;
  }

  // ── inv/clear ──────────────────────────────────────────────────────────────
  if (grp === 'inv' && sub === 'clear') {
    const user = interaction.options.getUser('kullanici', true);
    const count = await ctx.prisma.inventoryItem.count({ where: { ownerId: user.id } });
    await ctx.prisma.inventoryItem.deleteMany({ where: { ownerId: user.id } });
    await interaction.reply({ content: `✅ <@${user.id}> envanteri temizlendi. (${count} item silindi) 🗑️`, flags: 64 });
    return;
  }

  // ── sys/clearcooldown ──────────────────────────────────────────────────────
  if (grp === 'sys' && sub === 'clearcooldown') {
    const user = interaction.options.getUser('kullanici', true);
    await clearCooldown(ctx.redis, `cooldown:hunt:${user.id}`);
    await interaction.reply({ content: `✅ <@${user.id}> hunt cooldown temizlendi. ⏰`, flags: 64 });
    return;
  }

  // ── sys/clearallcooldowns ──────────────────────────────────────────────────
  if (grp === 'sys' && sub === 'clearallcooldowns') {
    const cleared = await clearCooldownPattern(ctx.redis, 'cooldown:hunt:*');
    await interaction.reply({ content: `✅ ${cleared} hunt cooldown temizlendi. ⏰`, flags: 64 });
    return;
  }

  // ── sys/clearupgradecooldown ───────────────────────────────────────────────
  if (grp === 'sys' && sub === 'clearupgradecooldown') {
    const user = interaction.options.getUser('kullanici', true);
    await clearCooldown(ctx.redis, `cooldown:upgrade:${user.id}`);
    await interaction.reply({ content: `✅ <@${user.id}> upgrade cooldown temizlendi. ⏰`, flags: 64 });
    return;
  }

  // ── sys/ops ────────────────────────────────────────────────────────────────
  if (grp === 'sys' && sub === 'ops') {
    const view = (interaction.options.getString('view', true) ?? 'system') as
      | 'system'
      | 'traffic'
      | 'abuse'
      | 'infra';
    const { buildOpsViewMessage } = await import('../ops/admin-ops-views.js');
    const content = await buildOpsViewMessage(ctx.redis, view);
    await interaction.reply({ content, flags: 64 });
    return;
  }

  // ── sys/perf ───────────────────────────────────────────────────────────────
  if (grp === 'sys' && sub === 'perf') {
    const { buildPerfReport } = await import('../utils/perf-metrics.js');
    const report = await buildPerfReport(ctx.redis, 5);
    await interaction.reply({ content: report, flags: 64 });
    return;
  }

  // ── sys/huntperf ───────────────────────────────────────────────────────────
  if (grp === 'sys' && sub === 'huntperf') {
    if (!isHuntHotPathMetricsEnabled()) {
      await interaction.reply({
        content: 'ℹ️ HUNT_HOTPATH_METRICS kapalı. Açmak için `.env` içine `HUNT_HOTPATH_METRICS=1` ekleyip botu yeniden başlat.',
        flags: 64,
      });
      return;
    }

    await forceFlushHuntHotPathMetrics(ctx.redis);
    const snapshot = await getLatestHuntHotPathSnapshot(ctx.redis);
    if (!snapshot) {
      const pending = await getPendingHuntSampleCount(ctx.redis);
      await interaction.reply({
        content:
          `ℹ️ Henüz hunt perf snapshot yok.\n` +
          `- Redis bekleyen örnek: **${pending}**\n` +
          `- En az **1 hunt** sonrası komutu tekrar dene\n` +
          `- Log: \`grep HuntHotPathMetrics logs/shard-out.log\``,
        flags: 64,
      });
      return;
    }

    await interaction.reply({ content: buildHuntHotPathReport(snapshot), flags: 64 });
    return;
  }

  // ── sys/info ───────────────────────────────────────────────────────────────
  if (grp === 'sys' && sub === 'info') {
    const [playerCount, owlCount, itemCount, pvpCount] = await Promise.all([
      ctx.prisma.player.count(),
      ctx.prisma.owl.count(),
      ctx.prisma.inventoryItem.count(),
      ctx.prisma.pvpSession.count(),
    ]);
    const topPlayers = await ctx.prisma.player.findMany({
      orderBy: { level: 'desc' },
      take: 5,
      select: { id: true, level: true, coins: true },
    });

    let t = `🌐 **Sunucu İstatistikleri**\n\n`;
    t += `👥 Oyuncu: **${playerCount}** | 🦉 Baykuş: **${owlCount}** | 📦 Item: **${itemCount}** | ⚔️ PvP: **${pvpCount}**\n\n`;
    t += `🏆 **Top 5 Oyuncu**\n`;
    topPlayers.forEach((p: { id: string; level: number; coins: number }, i: number) => {
      t += `${i + 1}. <@${p.id}> — Lv.**${p.level}** | ${formatCoinLabel(p.coins)}\n`;
    });
    await interaction.reply({ content: t, flags: 64 });
    return;
  }

  // ── sys/broadcast ──────────────────────────────────────────────────────────
  if (grp === 'sys' && sub === 'broadcast') {
    const baslik = interaction.options.getString('baslik', true);
    const mesajRaw = interaction.options.getString('mesaj', true);
    const footer = interaction.options.getString('footer') ?? null;
    const renkKey = interaction.options.getString('renk') ?? 'blue';

    const RENK_MAP: Record<string, number> = {
      blue:   0x3b82f6,
      green:  0x22c55e,
      yellow: 0xf59e0b,
      red:    0xef4444,
      purple: 0x8b5cf6,
    };
    const embedColor = RENK_MAP[renkKey] ?? 0x3b82f6;

    // Yazdığın metin olduğu gibi gider: \n ve gerçek satır sonları korunur, boş satırlar silinmez.
    const formatBroadcastBody = (raw: string): string => {
      let text = raw.replace(/\r\n/g, '\n').replace(/\\n/g, '\n');
      if (text.length > 4096) {
        text = `${text.slice(0, 4093)}…`;
      }
      return text;
    };

    const formatliMetin = formatBroadcastBody(mesajRaw);

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(`📢 ${baslik}`)
      .setDescription(formatliMetin)
      .setTimestamp();

    if (footer) {
      embed.setFooter({ text: footer });
    }

    const players = await ctx.prisma.player.findMany({ select: { id: true } });

    // Önizleme — sadece admin görür
    await interaction.reply({
      content: `📋 **Önizleme** — ${players.length} oyuncuya gönderilecek:`,
      embeds: [embed],
      flags: 64,
    });
    await interaction.followUp({ content: `⏳ **${players.length}** oyuncuya gönderiliyor...`, flags: 64 });

    let sent = 0;
    let failed = 0;
    for (const p of players) {
      try {
        const discordUser = await interaction.client.users.fetch(p.id);
        await discordUser.send({ embeds: [embed] });
        sent++;
      } catch {
        failed++;
        // DM kapalı veya kullanıcı bulunamadı — atla
      }
    }

    await interaction.followUp({
      content: `✅ Gönderim tamamlandı.\n📨 Ulaşılan: **${sent}** | ❌ Ulaşılamayan: **${failed}**`,
      flags: 64,
    });
    return;
  }

  // ── lb/siralama ────────────────────────────────────────────────────────────
  if (grp === 'lb' && sub === 'siralama') {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({ content: `❌ Bu komut sadece sunucuda kullanılabilir.`, flags: 64 });
      return;
    }
    await interaction.deferReply({ flags: 64 });
    const embed = await createLeaderboardRoles(interaction.guild, ctx.redis);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // ── lb/syncroles ───────────────────────────────────────────────────────────
  if (grp === 'lb' && sub === 'syncroles') {
    await interaction.deferReply({ flags: 64 });
    await syncAllRoles(interaction.client, MAIN_GUILD_ID, ctx.prisma, ctx.redis);
    await interaction.editReply({
      content: '✅ Liderboard rolleri senkronize edildi.',
    });
    return;
  }

  // ── lb/testduyuru ──────────────────────────────────────────────────────────
  if (grp === 'lb' && sub === 'testduyuru') {
    await interaction.deferReply({ flags: 64 });
    const category = interaction.options.getString('kategori', true) as 'power' | 'arena' | 'wealth';
    const newUser = interaction.options.getUser('yeni', true);
    const oldUser = interaction.options.getUser('eski', true);
    const sendDm = interaction.options.getBoolean('dm') ?? false;

    if (newUser.id === oldUser.id) {
      await interaction.editReply({ content: '❌ Yeni ve eski sahip aynı oyuncu olamaz.' });
      return;
    }

    try {
      const event = await buildRoleStealEvent(
        ctx.prisma,
        ctx.redis,
        category,
        newUser.id,
        oldUser.id,
      );
      await announceRoleSteals(interaction.client, [event], { sendDm });
      await interaction.editReply({
        content:
          `✅ Test duyurusu gönderildi → <#${LEADERBOARD_ROLE_STEAL_CHANNEL_ID}>` +
          (sendDm ? ' · DM\'ler de gönderildi' : ' · DM gönderilmedi'),
        embeds: [buildRoleStealEmbed(event)],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await interaction.editReply({ content: `❌ ${msg}` });
    }
    return;
  }

  // ── lb/cache ───────────────────────────────────────────────────────────────
  if (grp === 'lb' && sub === 'cache') {
    await invalidateLeaderboardCache(ctx.redis);
    await interaction.reply({ content: `✅ Liderboard cache temizlendi. Bir sonraki sorgu DB'den yüklenecek.`, flags: 64 });
    return;
  }

  // ── lb/season ──────────────────────────────────────────────────────────────
  if (grp === 'lb' && sub === 'season') {
    if (!LEADERBOARD_SEASON_RESET_ENABLED) {
      await interaction.reply({
        content: '📊 **Kalıcı sıralama** aktif — otomatik sezon sıfırlaması kapalı. Puanlar birikimli tutulur.',
        flags: 64,
      });
      return;
    }
    const season = await getCurrentSeason(ctx.prisma);
    if (!season) {
      await interaction.reply({ content: `ℹ️ Henüz aktif sezon yok. İlk oyun aksiyonunda otomatik oluşur.`, flags: 64 });
      return;
    }
    const remaining = Math.max(0, season.endsAt.getTime() - Date.now());
    const days = Math.floor(remaining / 86400000);
    const hours = Math.floor((remaining % 86400000) / 3600000);
    await interaction.reply({
      content: `📅 **Aktif Sezon:** \`${season.seasonId}\`\n🕐 **Tip:** ${season.seasonType}\n⏳ **Bitiş:** <t:${Math.floor(season.endsAt.getTime() / 1000)}:F>\n⌛ **Kalan:** ${days}g ${hours}s`,
      flags: 64,
    });
    return;
  }

  // ── lb/reset ───────────────────────────────────────────────────────────────
  if (grp === 'lb' && sub === 'reset') {
    if (!LEADERBOARD_SEASON_RESET_ENABLED) {
      await interaction.reply({
        content: '❌ Sezon sıfırlama devre dışı — sıralama kalıcı tutuluyor (`LEADERBOARD_SEASON_RESET_ENABLED=false`).',
        flags: 64,
      });
      return;
    }
    await interaction.reply({ content: `⚠️ Sezon sıfırlanıyor... Bu işlem geri alınamaz.`, flags: 64 });
    const archivedId = await archiveAndResetSeason(ctx.prisma, ctx.redis);
    await interaction.followUp({ content: `✅ Sezon **${archivedId}** arşivlendi. Yeni sezon başladı.`, flags: 64 });
    return;
  }

  // ── lb/refreshscore ────────────────────────────────────────────────────────
  if (grp === 'lb' && sub === 'refreshscore') {
    const user = interaction.options.getUser('kullanici', true);
    const score = await refreshPowerScore(ctx.prisma, user.id);
    await interaction.reply({ content: `✅ <@${user.id}> power score güncellendi: **${score.toLocaleString('tr-TR')}**`, flags: 64 });
    return;
  }

  // ── lb/backfill ────────────────────────────────────────────────────────────
  if (grp === 'lb' && sub === 'backfill') {
    await interaction.reply({ content: `⏳ Backfill başlatılıyor, tüm oyuncular işleniyor...`, flags: 64 });
    const { updated } = await backfillLeaderboardStats(ctx.prisma, ctx.redis);
    await invalidateLeaderboardCache(ctx.redis);
    await interaction.followUp({
      content: `✅ **${updated}** oyuncunun liderboard verisi güncellendi.\nCache temizlendi — \`owl top\` ile kontrol edebilirsin.`,
      flags: 64,
    });
    return;
  }

  // ── sys/testtame ───────────────────────────────────────────────────────────
  if (grp === 'sys' && sub === 'testtame') {
    await handleTestTame(interaction, ctx);
    return;
  }

  // ── sys/testmoon ───────────────────────────────────────────────────────────
  if (grp === 'sys' && sub === 'testmoon') {
    await handleTestMoon(interaction, ctx);
    return;
  }

  // ── player/undo ────────────────────────────────────────────────────────────
  if (grp === 'player' && sub === 'undo') {

    const userId = interaction.options.getString('userid', true);

    try {
      const { action, restoredState } = await undoLastAction(ctx.prisma, userId);

      const stateLines = Object.entries(restoredState)
        .map(([k, v]) => `• **${k}**: ${v}`)
        .join('\n');

      await interaction.reply({
        content: `✅ <@${userId}> için **${action}** işlemi geri alındı.\n\n**Geri yüklenen durum:**\n${stateLines}`,
        flags: 64,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
      await interaction.reply({ content: `❌ Geri alma başarısız: ${message}`, flags: 64 });
    }
    return;
  }

  // ── player/delete ──────────────────────────────────────────────────────────
  if (grp === 'player' && sub === 'delete') {
    const user = interaction.options.getUser('kullanici', true);

    const player = await ctx.prisma.player.findUnique({ where: { id: user.id } });
    if (!player) {
      await interaction.reply({ content: `❌ <@${user.id}> kayıtlı değil.`, flags: 64 });
      return;
    }

    await interaction.deferReply({ flags: 64 });

    try {
      // Foreign key bağımlılık sırasına göre sil
      await ctx.prisma.$transaction([
        ctx.prisma.auditLog.deleteMany({ where: { playerId: user.id } }),
        ctx.prisma.dailyQuest.deleteMany({ where: { playerId: user.id } }),
        ctx.prisma.playerBuff.deleteMany({ where: { playerId: user.id } }),
        ctx.prisma.encounter.deleteMany({ where: { playerId: user.id } }),
        ctx.prisma.pvpSession.deleteMany({
          where: { OR: [{ challengerId: user.id }, { defenderId: user.id }] },
        }),
        ctx.prisma.marketListing.deleteMany({ where: { sellerId: user.id } }),
        ctx.prisma.seasonArchive.deleteMany({ where: { playerId: user.id } }),
        ctx.prisma.playerRegistration.deleteMany({ where: { userId: user.id } }),
        ctx.prisma.inventoryItem.deleteMany({ where: { ownerId: user.id } }),
        ctx.prisma.owl.deleteMany({ where: { ownerId: user.id } }),
        ctx.prisma.player.delete({ where: { id: user.id } }),
      ]);

      // Redis cache temizle
      await Promise.allSettled([
        ctx.redis.del(`player:${user.id}`),
        clearCooldown(ctx.redis, `cooldown:hunt:${user.id}`),
        clearCooldown(ctx.redis, `cooldown:upgrade:${user.id}`),
        ctx.redis.del(`biome_session:${user.id}`),
        ctx.redis.del(`upgrade:panel:${user.id}`),
      ]);

      await interaction.editReply({
        content: `✅ <@${user.id}> (**${user.username}**) tamamen silindi.\n🗑️ Tüm veriler (oyuncu, baykuş, envanter, buff, PvP, encounter) kaldırıldı.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
      await interaction.editReply({ content: `❌ Silme başarısız: ${message}` });
    }
    return;
  }

  // ── owl/give ───────────────────────────────────────────────────────────────
  if (grp === 'owl' && sub === 'give') {
    const user    = interaction.options.getUser('kullanici', true);
    const tier    = interaction.options.getInteger('tier', true);
    const quality = interaction.options.getString('kalite', true);

    const { OWL_SPECIES, OWL_BASE_HP, OWL_BASE_STAMINA } = await import('../config.js');
    const species = OWL_SPECIES.find((s: any) => s.tier === tier);
    if (!species) { await interaction.reply({ content: `❌ Geçersiz tier.`, flags: 64 }); return; }

    const player = await ctx.prisma.player.findUnique({ where: { id: user.id } });
    if (!player) { await interaction.reply({ content: `❌ <@${user.id}> kayıtlı değil.`, flags: 64 }); return; }

    const hp = OWL_BASE_HP[tier] ?? 100;
    const stamina = OWL_BASE_STAMINA[tier] ?? 100;

    await ctx.prisma.owl.create({
      data: {
        ownerId: user.id, species: species.name, tier, quality,
        hp, hpMax: hp, staminaCur: stamina,
        statGaga: 5, statGoz: 5, statKulak: 5, statKanat: 5, statPence: 5,
        isMain: false, effectiveness: 100,
      },
    });

    await interaction.reply({
      content: `✅ <@${user.id}> oyuncusuna **Tier ${tier} ${species.name}** (${quality}) baykuşu verildi.`,
      flags: 64,
    });
    return;
  }

  // ── owl/setquality ─────────────────────────────────────────────────────────
  if (grp === 'owl' && sub === 'setquality') {
    const user    = interaction.options.getUser('kullanici', true);
    const quality = interaction.options.getString('kalite', true);
    const owl = await ctx.prisma.owl.findFirst({ where: { ownerId: user.id, isMain: true } });
    if (!owl) { await interaction.reply({ content: `❌ <@${user.id}> main baykuşu yok.`, flags: 64 }); return; }

    await ctx.prisma.owl.update({ where: { id: owl.id }, data: { quality } });
    await interaction.reply({ content: `✅ <@${user.id}> baykuşunun kalitesi **${quality}** olarak ayarlandı.`, flags: 64 });
    return;
  }

  // ── owl/seteffectiveness ───────────────────────────────────────────────────
  if (grp === 'owl' && sub === 'seteffectiveness') {
    const user  = interaction.options.getUser('kullanici', true);
    const value = interaction.options.getInteger('deger', true);
    const owl = await ctx.prisma.owl.findFirst({ where: { ownerId: user.id, isMain: true } });
    if (!owl) { await interaction.reply({ content: `❌ <@${user.id}> main baykuşu yok.`, flags: 64 }); return; }

    await ctx.prisma.owl.update({ where: { id: owl.id }, data: { effectiveness: value } });
    await interaction.reply({ content: `✅ <@${user.id}> baykuşunun effectiveness değeri **${value}** olarak ayarlandı.`, flags: 64 });
    return;
  }

  // ── owl/setpassivemode ─────────────────────────────────────────────────────
  if (grp === 'owl' && sub === 'setpassivemode') {
    const user = interaction.options.getUser('kullanici', true);
    const mod  = interaction.options.getString('mod', true);
    const owl = await ctx.prisma.owl.findFirst({ where: { ownerId: user.id, isMain: true } });
    if (!owl) { await interaction.reply({ content: `❌ <@${user.id}> main baykuşu yok.`, flags: 64 }); return; }

    await ctx.prisma.owl.update({ where: { id: owl.id }, data: { passiveMode: mod } });
    await interaction.reply({ content: `✅ <@${user.id}> baykuşunun pasif modu **${mod}** olarak ayarlandı.`, flags: 64 });
    return;
  }

  // ── inv/givebuff ───────────────────────────────────────────────────────────
  if (grp === 'inv' && sub === 'givebuff') {
    const user     = interaction.options.getUser('kullanici', true);
    const buffId   = interaction.options.getString('buffid', true);
    const quantity = interaction.options.getInteger('miktar') ?? 1;

    const { BUFF_ITEM_MAP } = await import('../config.js');
    const def = BUFF_ITEM_MAP[buffId];
    if (!def) { await interaction.reply({ content: `❌ Geçersiz buff ID: \`${buffId}\``, flags: 64 }); return; }

    const player = await ctx.prisma.player.findUnique({ where: { id: user.id } });
    if (!player) { await interaction.reply({ content: `❌ <@${user.id}> kayıtlı değil.`, flags: 64 }); return; }

    await (ctx.prisma as any).inventoryItem.upsert({
      where:  { ownerId_itemName: { ownerId: user.id, itemName: def.name } },
      create: { ownerId: user.id, itemName: def.name, itemType: 'Buff', rarity: def.rarity, quantity },
      update: { quantity: { increment: quantity } },
    });

    await interaction.reply({ content: `✅ <@${user.id}> envanterine **${quantity}x ${displayBuffEmoji(def)} ${def.name}** eklendi.`, flags: 64 });
    return;
  }

  // ── inv/givelootbox ────────────────────────────────────────────────────────
  if (grp === 'inv' && sub === 'givelootbox') {
    const user     = interaction.options.getUser('kullanici', true);
    const boxName  = interaction.options.getString('tip', true);
    const quantity = interaction.options.getInteger('miktar') ?? 1;

    const player = await ctx.prisma.player.findUnique({ where: { id: user.id } });
    if (!player) { await interaction.reply({ content: `❌ <@${user.id}> kayıtlı değil.`, flags: 64 }); return; }

    await (ctx.prisma as any).inventoryItem.upsert({
      where:  { ownerId_itemName: { ownerId: user.id, itemName: boxName } },
      create: { ownerId: user.id, itemName: boxName, itemType: 'Lootbox', rarity: 'Rare', quantity },
      update: { quantity: { increment: quantity } },
    });

    await interaction.reply({ content: `✅ <@${user.id}> envanterine **${quantity}x ${boxName}** eklendi.`, flags: 64 });
    return;
  }

  // ── inv/view ───────────────────────────────────────────────────────────────
  if (grp === 'inv' && sub === 'view') {
    const user  = interaction.options.getUser('kullanici', true);
    const items = await ctx.prisma.inventoryItem.findMany({
      where: { ownerId: user.id },
      orderBy: [{ itemType: 'asc' }, { itemName: 'asc' }],
    });

    if (items.length === 0) {
      await interaction.reply({ content: `ℹ️ <@${user.id}> envanteri boş.`, flags: 64 });
      return;
    }

    const grouped = new Map<string, typeof items>();
    for (const item of items) {
      const list = grouped.get(item.itemType) ?? [];
      list.push(item);
      grouped.set(item.itemType, list);
    }

    const lines: string[] = [`📦 **<@${user.id}> Envanteri** (${items.length} çeşit)\n`];
    for (const [type, list] of grouped) {
      lines.push(`**${type}**`);
      for (const item of list) lines.push(`  • ${item.itemName} ×${item.quantity} *(${item.rarity})*`);
    }

    await interaction.reply({ content: lines.join('\n').slice(0, 1990), flags: 64 });
    return;
  }

  // ── stats/economy ──────────────────────────────────────────────────────────
  if (grp === 'stats' && sub === 'economy') {
    await interaction.deferReply({ flags: 64 });

    const [playerCount, totalCoinsRaw, richest, mostActive] = await Promise.all([
      ctx.prisma.player.count(),
      ctx.prisma.player.aggregate({ _sum: { coins: true } }),
      ctx.prisma.player.findMany({ orderBy: { coins: 'desc' }, take: 5, select: { id: true, coins: true, level: true } }),
      ctx.prisma.player.findMany({ orderBy: { totalHunts: 'desc' }, take: 5, select: { id: true, totalHunts: true, totalCoinsEarned: true } }),
    ]);

    const totalCoins = totalCoinsRaw._sum.coins ?? 0;
    const avgCoins   = playerCount > 0 ? Math.round(totalCoins / playerCount) : 0;

    let t = `${COIN_EMOJI} **Ekonomi İstatistikleri**\n\n`;
    t += `👥 Toplam oyuncu: **${playerCount}**\n`;
    t += `Toplam coin (dolaşımda): ${formatCoinLabel(totalCoins)}\n`;
    t += `📊 Oyuncu başına ortalama: ${formatCoinLabel(avgCoins)}\n\n`;
    t += `🏆 **En Zengin 5 Oyuncu**\n`;
    richest.forEach((p: any, i: number) => {
      t += `${i + 1}. <@${p.id}> — ${formatCoinLabel(p.coins)} (Lv.${p.level})\n`;
    });
    t += `\n🔥 **En Aktif 5 Oyuncu**\n`;
    mostActive.forEach((p: any, i: number) => {
      t += `${i + 1}. <@${p.id}> — **${p.totalHunts}** hunt | **${p.totalCoinsEarned.toLocaleString('tr-TR')}** toplam kazanç\n`;
    });

    await interaction.editReply({ content: t });
    return;
  }

  // ── player/transfercoins ───────────────────────────────────────────────────
  if (grp === 'player' && sub === 'transfercoins') {
    const from   = interaction.options.getUser('gonderen', true);
    const to     = interaction.options.getUser('alan', true);
    const amount = interaction.options.getInteger('miktar', true);

    const [fromPlayer, toPlayer] = await Promise.all([
      ctx.prisma.player.findUnique({ where: { id: from.id } }),
      ctx.prisma.player.findUnique({ where: { id: to.id } }),
    ]);

    if (!fromPlayer) { await interaction.reply({ content: `❌ <@${from.id}> kayıtlı değil.`, flags: 64 }); return; }
    if (!toPlayer)   { await interaction.reply({ content: `❌ <@${to.id}> kayıtlı değil.`, flags: 64 }); return; }
    if (fromPlayer.coins < amount) {
      await interaction.reply({ content: `❌ <@${from.id}> yeterli coini yok. (Sahip: ${fromPlayer.coins})`, flags: 64 });
      return;
    }

    await runWithFinancialLocks([from.id, to.id], async () => {
      await ctx.prisma.$transaction([
        ctx.prisma.player.update({ where: { id: from.id }, data: { coins: { decrement: amount } } }),
        ctx.prisma.player.update({ where: { id: to.id }, data: { coins: { increment: amount } } }),
      ]);
      await Promise.all([
        applyCoinDeltaInRedis(ctx.redis, from.id, -amount, ctx.prisma),
        applyCoinDeltaInRedis(ctx.redis, to.id, amount, ctx.prisma),
      ]);
    });

    await interaction.reply({
      content: `✅ <@${from.id}> → <@${to.id}> arası ${formatCoinLabel(amount)} aktarıldı.`,
      flags: 64,
    });
    return;
  }

  // ── player/setprestige ─────────────────────────────────────────────────────
  if (grp === 'player' && sub === 'setprestige') {
    const user  = interaction.options.getUser('kullanici', true);
    const level = interaction.options.getInteger('seviye', true);

    const player = await ctx.prisma.player.findUnique({ where: { id: user.id } });
    if (!player) { await interaction.reply({ content: `❌ <@${user.id}> kayıtlı değil.`, flags: 64 }); return; }

    await ctx.prisma.player.update({ where: { id: user.id }, data: { prestigeLevel: level } });
    await rehydratePlayerState(ctx.redis, ctx.prisma, user.id);
    await interaction.reply({ content: `✅ <@${user.id}> prestige seviyesi **${level}** olarak ayarlandı. ⭐`, flags: 64 });
    return;
  }

  // ── inv/givebuffactive ─────────────────────────────────────────────────────
  if (grp === 'inv' && sub === 'givebuffactive') {
    const user = interaction.options.getUser('kullanici', true);
    const buffId = interaction.options.getString('buffid', true);

    const { BUFF_ITEM_MAP } = await import('../config.js');
    const def = BUFF_ITEM_MAP[buffId];
    if (!def) {
      await interaction.reply({ content: `❌ Geçersiz buff ID: \`${buffId}\`. Geçerli ID'ler: b001–b012`, flags: 64 });
      return;
    }

    const player = await ctx.prisma.player.findUnique({ where: { id: user.id } });
    if (!player) { await interaction.reply({ content: `❌ <@${user.id}> kayıtlı değil.`, flags: 64 }); return; }

    await (ctx.prisma as any).playerBuff.create({
      data: {
        playerId:    user.id,
        buffItemId:  def.id,
        category:    def.category,
        effectType:  def.effectType,
        effectValue: def.effectValue,
        chargeMax:   def.chargeMax,
        chargeCur:   def.chargeMax,
      },
    });

    await interaction.reply({
      content: `✅ <@${user.id}> oyuncusuna **${displayBuffEmoji(def)} ${def.name}** buff'ı takıldı. (${def.chargeMax} charge)`,
      flags: 64,
    });
    return;
  }

  // ── inv/clearbuffs ─────────────────────────────────────────────────────────
  if (grp === 'inv' && sub === 'clearbuffs') {
    const user = interaction.options.getUser('kullanici', true);
    const { count } = await (ctx.prisma as any).playerBuff.deleteMany({ where: { playerId: user.id } });
    await interaction.reply({
      content: `✅ <@${user.id}> oyuncusunun **${count}** buff kaydı silindi.`,
      flags: 64,
    });
    return;
  }

  // ── inv/listbuffs ──────────────────────────────────────────────────────────
  if (grp === 'inv' && sub === 'listbuffs') {
    const user = interaction.options.getUser('kullanici', true);
    const { BUFF_ITEM_MAP } = await import('../config.js');

    const buffs = await (ctx.prisma as any).playerBuff.findMany({
      where: { playerId: user.id },
      orderBy: { createdAt: 'asc' },
    });

    if (buffs.length === 0) {
      await interaction.reply({ content: `ℹ️ <@${user.id}> oyuncusunun aktif buff'ı yok.`, flags: 64 });
      return;
    }

    const lines = buffs.map((b: any) => {
      const def = BUFF_ITEM_MAP[b.buffItemId];
      const emoji = def ? displayBuffEmoji(def) : '✨';
      const name  = def?.name  ?? b.buffItemId;
      const status = b.chargeCur > 0 ? `🟢 ${chargeBadge(b.chargeCur, b.chargeMax)}` : `🔴 tükenmiş`;
      return `• ${emoji} **${name}** — ${status} | kategori: ${b.category}`;
    }).join('\n');

    await interaction.reply({
      content: `🔋 **<@${user.id}> Buff Listesi** (${buffs.length} kayıt)\n\n${lines}`,
      flags: 64,
    });
    return;
  }

  // ── player/list ────────────────────────────────────────────────────────────
  if (grp === 'player' && sub === 'list') {
    const page     = (interaction.options.getInteger('sayfa') ?? 1) - 1;
    const pageSize = 15;
    const [players, total] = await Promise.all([
      ctx.prisma.player.findMany({
        orderBy: { level: 'desc' },
        skip: page * pageSize,
        take: pageSize,
        select: { id: true, level: true, coins: true, totalHunts: true, createdAt: true },
      }),
      ctx.prisma.player.count(),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    const lines = players.map((p: any, i: number) =>
      `${page * pageSize + i + 1}. <@${p.id}> — Lv.**${p.level}** | ${formatCoinLabel(p.coins)} | 🏹${p.totalHunts} hunt`
    ).join('\n');

    await interaction.reply({
      content: `👥 **Oyuncu Listesi** (Sayfa ${page + 1}/${totalPages}, Toplam: ${total})\n\n${lines}`,
      flags: 64,
    });
    return;
  }

  // ── stats/buffs ────────────────────────────────────────────────────────────
  if (grp === 'stats' && sub === 'buffs') {
    await interaction.deferReply({ flags: 64 });
    const { BUFF_ITEMS } = await import('../config.js');

    const allBuffs = await (ctx.prisma as any).playerBuff.groupBy({
      by: ['buffItemId'],
      _count: { buffItemId: true },
      _sum: { chargeCur: true, chargeMax: true },
    });

    const activeBuffs = await (ctx.prisma as any).playerBuff.count({ where: { chargeCur: { gt: 0 } } });
    const totalBuffs  = await (ctx.prisma as any).playerBuff.count();

    const lines = allBuffs.map((b: any) => {
      const def = BUFF_ITEMS.find((x: any) => x.id === b.buffItemId);
      const name = def ? `${displayBuffEmoji(def)} ${def.name}` : b.buffItemId;
      return `• ${name} — **${b._count.buffItemId}** kullanım`;
    }).sort((a: string, b: string) => a.localeCompare(b));

    let t = `📊 **Buff İstatistikleri**\n\n`;
    t += `🟢 Aktif buff: **${activeBuffs}** | Toplam kayıt: **${totalBuffs}**\n\n`;
    t += lines.join('\n');

    await interaction.editReply({ content: t });
    return;
  }

  // ── rollback/sell ─────────────────────────────────────────────────────────
  if (grp === 'rollback') {
    const {
      applySellRollback,
      formatRollbackPreviewText,
      getSellRollbackRetentionStats,
      previewSellRollback,
      resolveRollbackWindow,
    } = await import('../systems/sell-rollback.js');
    type SellRollbackPeriod = import('../config/sell-rollback.js').SellRollbackPeriod;

    if (sub === 'sell-kayit') {
      const stats = await getSellRollbackRetentionStats(ctx.prisma);
      await interaction.reply({
        content:
          `📋 **Sell kayıt retention (7 gün)**\n\n` +
          `Toplam: **${stats.total}** | Son 1s: **${stats.last1h}** | Son 24s: **${stats.last1d}** | Son 7g: **${stats.last7d}**` +
          (stats.oldest ? `\nEn eski: \`${stats.oldest}\`` : ''),
        flags: 64,
      });
      return;
    }

    const period = interaction.options.getString('donem', true) as SellRollbackPeriod;
    const date = interaction.options.getString('tarih') ?? undefined;
    const window = resolveRollbackWindow({ period, date });

    if (sub === 'sell-onizle') {
      await interaction.deferReply({ flags: 64 });
      const preview = await previewSellRollback(ctx.prisma, ctx.redis, window);
      await interaction.editReply({ content: formatRollbackPreviewText(preview) });
      return;
    }

    if (sub === 'sell-uygula') {
      const confirmed = interaction.options.getBoolean('onay', true);
      if (!confirmed) {
        await interaction.reply({ content: '❌ Rollback için `onay: true` gerekli.', flags: 64 });
        return;
      }
      await interaction.deferReply({ flags: 64 });
      const result = await applySellRollback(ctx.prisma, ctx.redis, window);
      let msg = formatRollbackPreviewText(result);
      if (result.applied) msg += `\n\n✅ Uygulandı · batch \`${result.batchId}\``;
      else msg += '\n\n⚠️ Geri alınacak kayıt yok.';
      await interaction.editReply({ content: msg });
      return;
    }
  }

  // ── sys/maintenance ────────────────────────────────────────────────────────
  if (grp === 'sys' && sub === 'maintenance') {
    const key     = MAINTENANCE_KEY;
    const current = await ctx.redis.get(key);

    if (current) {
      await ctx.redis.del(key);
      await interaction.reply({ content: `✅ Bakım modu **kapatıldı**. Bot normal çalışmaya devam ediyor.`, flags: 64 });
    } else {
      await ctx.redis.set(key, '1');
      await interaction.reply({ content: `🔧 Bakım modu **açıldı**. Oyuncular komut kullanamaz.`, flags: 64 });
    }
    return;
  }

  // ── stats/quests ───────────────────────────────────────────────────────────
  if (grp === 'stats' && sub === 'quests') {
    await interaction.deferReply({ flags: 64 });

    const [total, claimed, byType] = await Promise.all([
      ctx.prisma.dailyQuest.count(),
      ctx.prisma.dailyQuest.count({ where: { isClaimed: true } }),
      ctx.prisma.dailyQuest.groupBy({ by: ['type'], _count: { type: true } }),
    ]);

    const typeLines = byType.map((t: any) => `  • ${t.type}: **${t._count.type}**`).join('\n');
    let text = `📋 **Günlük Görev İstatistikleri**\n\n`;
    text += `Toplam görev: **${total}** | Tamamlanan: **${claimed}** (%${total > 0 ? Math.round(claimed / total * 100) : 0})\n\n`;
    text += `**Tipe Göre Dağılım:**\n${typeLines}`;

    await interaction.editReply({ content: text });
    return;
  }

  // ── stats/pvp ──────────────────────────────────────────────────────────────
  if (grp === 'stats' && sub === 'pvp') {
    await interaction.deferReply({ flags: 64 });

    const [total, finished, topWinners] = await Promise.all([
      ctx.prisma.pvpSession.count(),
      ctx.prisma.pvpSession.count({ where: { status: 'finished' } }),
      ctx.prisma.player.findMany({ orderBy: { totalPvpWins: 'desc' }, take: 5, select: { id: true, totalPvpWins: true, pvpBestStreak: true } }),
    ]);

    let text = `⚔️ **PvP İstatistikleri**\n\n`;
    text += `Toplam maç: **${total}** | Tamamlanan: **${finished}**\n\n`;
    text += `🏆 **En Çok Kazanan 5 Oyuncu**\n`;
    topWinners.forEach((p: any, i: number) => {
      text += `${i + 1}. <@${p.id}> — **${p.totalPvpWins}** galibiyet | En iyi streak: **${p.pvpBestStreak}**\n`;
    });

    await interaction.editReply({ content: text });
    return;
  }

  // ── stats/market ───────────────────────────────────────────────────────────
  if (grp === 'stats' && sub === 'market') {
    await interaction.deferReply({ flags: 64 });

    const [total, byItem] = await Promise.all([
      ctx.prisma.marketListing.count(),
      ctx.prisma.marketListing.groupBy({
        by: ['itemName'],
        _count: { itemName: true },
        _sum: { quantity: true },
        orderBy: { _count: { itemName: 'desc' } },
        take: 10,
      }),
    ]);

    const itemLines = byItem.map((i: any) =>
      `  • **${i.itemName}** — ${i._count.itemName} ilan, ${i._sum.quantity ?? 0} adet`
    ).join('\n');

    let text = `🏪 **Market İstatistikleri**\n\n`;
    text += `Aktif ilan: **${total}**\n\n`;
    text += `**En Çok İlan Edilen 10 Item:**\n${itemLines}`;

    await interaction.editReply({ content: text });
    return;
  }
}

export default { data, execute } satisfies CommandDefinition;

