import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { CommandDefinition } from '../types';
import { archiveAndResetSeason, getCurrentSeason, invalidateLeaderboardCache, refreshPowerScore, backfillLeaderboardStats } from '../systems/leaderboard';
import { createLeaderboardRoles, syncAllRoles } from '../systems/roles';
import { handleTestTame } from './admin-testtame';

const ADMIN_IDS = new Set([
  '1110219662509224006',
  '362666788149788672',
  '1224054730716614667',
  '1197562104446726225'
  // Ana admin
  // Buraya yeni admin ID'lerini ekle:
  // '123456789012345678',
]);

const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Admin komutlari')
  // ── Oyuncu ──────────────────────────────────────────────────────────────────
  .addSubcommand((s) => s.setName('stats').setDescription('Oyuncu detaylı bilgi')
    .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true)))
  .addSubcommand((s) => s.setName('resetplayer').setDescription('Oyuncuyu sıfırla (level/xp/coin/streak)')
    .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true)))
  .addSubcommand((s) => s.setName('setlevel').setDescription('Seviye ayarla')
    .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true))
    .addIntegerOption((o) => o.setName('seviye').setDescription('Yeni seviye').setRequired(true).setMinValue(1)))
  .addSubcommand((s) => s.setName('setcoins').setDescription('Coin miktarını direkt ayarla')
    .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true))
    .addIntegerOption((o) => o.setName('miktar').setDescription('Coin miktari').setRequired(true).setMinValue(0)))
  .addSubcommand((s) => s.setName('addcoins').setDescription('Coin ekle')
    .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true))
    .addIntegerOption((o) => o.setName('miktar').setDescription('Miktar').setRequired(true)))
  .addSubcommand((s) => s.setName('addxp').setDescription('XP ekle')
    .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true))
    .addIntegerOption((o) => o.setName('miktar').setDescription('Miktar').setRequired(true)))
  // ── Baykuş ──────────────────────────────────────────────────────────────────
  .addSubcommand((s) => s.setName('healowl').setDescription('Main baykuşu tam HP yap')
    .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true)))
  .addSubcommand((s) => s.setName('setstat').setDescription('Baykuş statını ayarla')
    .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true))
    .addStringOption((o) => o.setName('stat').setDescription('Stat').setRequired(true)
      .addChoices(
        { name: 'gaga', value: 'statGaga' },
        { name: 'goz', value: 'statGoz' },
        { name: 'kulak', value: 'statKulak' },
        { name: 'kanat', value: 'statKanat' },
        { name: 'pence', value: 'statPence' },
      ))
    .addIntegerOption((o) => o.setName('deger').setDescription('Yeni değer').setRequired(true).setMinValue(1)))
  .addSubcommand((s) => s.setName('resetowl').setDescription('Main baykuşun statlarını sıfırla')
    .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true)))
  // ── Envanter ────────────────────────────────────────────────────────────────
  .addSubcommand((s) => s.setName('additem').setDescription('Item ekle')
    .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true))
    .addStringOption((o) => o.setName('item').setDescription('Item adi').setRequired(true))
    .addIntegerOption((o) => o.setName('miktar').setDescription('Miktar').setRequired(true).setMinValue(1))
    .addStringOption((o) => o.setName('tip').setDescription('Item tipi').addChoices(
      { name: 'Materyal', value: 'Materyal' },
      { name: 'Av', value: 'Av' },
    )))
  .addSubcommand((s) => s.setName('removeitem').setDescription('Envanterden item sil')
    .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true))
    .addStringOption((o) => o.setName('item').setDescription('Item adi').setRequired(true)))
  .addSubcommand((s) => s.setName('clearinventory').setDescription('Envanteri tamamen temizle')
    .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true)))
  // ── Cooldown ────────────────────────────────────────────────────────────────
  .addSubcommand((s) => s.setName('clearcooldown').setDescription('Hunt cooldown temizle')
    .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true)))
  .addSubcommand((s) => s.setName('clearallcooldowns').setDescription('TÜM hunt cooldownları temizle'))
  .addSubcommand((s) => s.setName('clearupgradecooldown').setDescription('Upgrade cooldown temizle')
    .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true)))
  // ── Sunucu ──────────────────────────────────────────────────────────────────
  .addSubcommand((s) => s.setName('serverinfo').setDescription('Sunucu istatistikleri'))
  .addSubcommand((s) => s.setName('broadcast').setDescription('Tüm kayıtlı oyunculara embed duyuru gönder')
    .addStringOption((o) => o.setName('baslik').setDescription('Embed başlığı').setRequired(true))
    .addStringOption((o) => o.setName('mesaj').setDescription('Mesaj gövdesi — liste için her satırı \\n ile ayır').setRequired(true))
    .addStringOption((o) => o.setName('footer').setDescription('Alt bilgi metni (opsiyonel)').setRequired(false))
    .addStringOption((o) => o.setName('renk').setDescription('Embed rengi').setRequired(false).addChoices(
      { name: '🔵 Mavi (Bilgi)',     value: 'blue'   },
      { name: '🟢 Yeşil (Başarı)',   value: 'green'  },
      { name: '🟡 Sarı (Uyarı)',     value: 'yellow' },
      { name: '🔴 Kırmızı (Kritik)', value: 'red'    },
      { name: '🟣 Mor (Özel)',       value: 'purple' },
    )))
  // ── Liderboard ──────────────────────────────────────────────────────────────
  .addSubcommand((s) => s.setName('siralama').setDescription('Liderboard rollerini sunucuda otomatik olustur'))
  .addSubcommand((s) => s.setName('lbcache').setDescription('Liderboard cache\'ini temizle'))
  .addSubcommand((s) => s.setName('lbseason').setDescription('Mevcut sezon bilgisini goster'))
  .addSubcommand((s) => s.setName('lbreset').setDescription('Sezonu arsivle ve sifirla (GERI ALINAMAZ)'))
  .addSubcommand((s) => s.setName('lbsyncroles').setDescription('Liderboard rollerini senkronize et (ata/kaldir)'))
  .addSubcommand((s) => s.setName('lbrefreshscore').setDescription('Oyuncunun power score\'unu yenile')
    .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true)))
  .addSubcommand((s) => s.setName('lbbackfill').setDescription('Mevcut oyuncu verisinden liderboard sayaclarini doldur'))
  // ── Test ────────────────────────────────────────────────────────────────────
  .addSubcommand((s) => s.setName('testtame').setDescription('Encounter oluştur ve tame UI\'ını başlat')
    .addIntegerOption((o) => o.setName('tier').setDescription('Baykuş tier (1-8)').setRequired(true).setMinValue(1).setMaxValue(8))
    .addStringOption((o) => o.setName('kalite').setDescription('Kalite (varsayılan: Common)').addChoices(
      { name: 'Trash',    value: 'Trash'    },
      { name: 'Common',   value: 'Common'   },
      { name: 'Good',     value: 'Good'     },
      { name: 'Rare',     value: 'Rare'     },
      { name: 'Elite',    value: 'Elite'    },
      { name: 'God Roll', value: 'God Roll' },
    ))
    .addUserOption((o) => o.setName('kullanici').setDescription('Hedef oyuncu (boş = kendin)')));

async function execute(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  if (!ADMIN_IDS.has(interaction.user.id)) {
    await interaction.reply({ content: '❌ Bu komutu sadece bot sahibi kullanabilir.', flags: 64 });
    return;
  }

  const sub = interaction.options.getSubcommand(true);

  // ── stats ──────────────────────────────────────────────────────────────────
  if (sub === 'stats') {
    const user = interaction.options.getUser('kullanici', true);
    const player = await ctx.prisma.player.findUnique({ where: { id: user.id } });
    if (!player) { await interaction.reply({ content: `❌ <@${user.id}> kayıtlı değil.`, flags: 64 }); return; }

    const owl = await ctx.prisma.owl.findFirst({ where: { ownerId: user.id, isMain: true } });
    const owlCount = await ctx.prisma.owl.count({ where: { ownerId: user.id } });
    const itemCount = await ctx.prisma.inventoryItem.count({ where: { ownerId: user.id } });

    let t = `📊 **Admin Stats — <@${user.id}>**\n\n`;
    t += `👤 Level: **${player.level}** | XP: **${player.xp}** | Coins: **${player.coins}** 💰\n`;
    t += `🦉 Baykuş: **${owlCount}** | 📦 Item: **${itemCount}** | 🔥 Streak: **${player.huntComboStreak}**\n`;
    if (owl) {
      t += `\n🦉 **Main:** ${owl.species} | HP: ${owl.hp}/${owl.hpMax} | Quality: ${owl.quality}\n`;
      t += `⚔️ Gaga:${owl.statGaga} Göz:${owl.statGoz} Kulak:${owl.statKulak} Kanat:${owl.statKanat} Pençe:${owl.statPence}`;
    }
    await interaction.reply({ content: t, flags: 64 });
    return;
  }

  // ── resetplayer ────────────────────────────────────────────────────────────
  if (sub === 'resetplayer') {
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

  // ── setlevel ───────────────────────────────────────────────────────────────
  if (sub === 'setlevel') {
    const user = interaction.options.getUser('kullanici', true);
    const level = interaction.options.getInteger('seviye', true);
    const player = await ctx.prisma.player.findUnique({ where: { id: user.id } });
    if (!player) { await interaction.reply({ content: `❌ <@${user.id}> kayıtlı değil.`, flags: 64 }); return; }

    await ctx.prisma.player.update({ where: { id: user.id }, data: { level, xp: 0 } });
    await interaction.reply({ content: `✅ <@${user.id}> seviyesi **${level}** olarak ayarlandı. 🎯`, flags: 64 });
    return;
  }

  // ── setcoins ───────────────────────────────────────────────────────────────
  if (sub === 'setcoins') {
    const user = interaction.options.getUser('kullanici', true);
    const amount = interaction.options.getInteger('miktar', true);
    const player = await ctx.prisma.player.findUnique({ where: { id: user.id } });
    if (!player) { await interaction.reply({ content: `❌ <@${user.id}> kayıtlı değil.`, flags: 64 }); return; }

    await ctx.prisma.player.update({ where: { id: user.id }, data: { coins: amount } });
    await interaction.reply({ content: `✅ <@${user.id}> coin: **${amount}** 💰`, flags: 64 });
    return;
  }

  // ── addcoins ───────────────────────────────────────────────────────────────
  if (sub === 'addcoins') {
    const user = interaction.options.getUser('kullanici', true);
    const amount = interaction.options.getInteger('miktar', true);
    const player = await ctx.prisma.player.findUnique({ where: { id: user.id } });
    if (!player) { await interaction.reply({ content: `❌ <@${user.id}> kayıtlı değil.`, flags: 64 }); return; }

    await ctx.prisma.player.update({ where: { id: user.id }, data: { coins: { increment: amount } } });
    await interaction.reply({ content: `✅ <@${user.id}> +${amount} coin eklendi. 💰`, flags: 64 });
    return;
  }

  // ── addxp ──────────────────────────────────────────────────────────────────
  if (sub === 'addxp') {
    const user = interaction.options.getUser('kullanici', true);
    const amount = interaction.options.getInteger('miktar', true);
    const player = await ctx.prisma.player.findUnique({ where: { id: user.id } });
    if (!player) { await interaction.reply({ content: `❌ <@${user.id}> kayıtlı değil.`, flags: 64 }); return; }

    await ctx.prisma.player.update({ where: { id: user.id }, data: { xp: { increment: amount } } });
    await interaction.reply({ content: `✅ <@${user.id}> +${amount} XP eklendi. ⭐`, flags: 64 });
    return;
  }

  // ── healowl ────────────────────────────────────────────────────────────────
  if (sub === 'healowl') {
    const user = interaction.options.getUser('kullanici', true);
    const owl = await ctx.prisma.owl.findFirst({ where: { ownerId: user.id, isMain: true } });
    if (!owl) { await interaction.reply({ content: `❌ <@${user.id}> main baykusu yok.`, flags: 64 }); return; }

    await ctx.prisma.owl.update({ where: { id: owl.id }, data: { hp: owl.hpMax, staminaCur: owl.hpMax } });
    await interaction.reply({ content: `✅ <@${user.id}> baykuşu tam HP/Stamina. ❤️`, flags: 64 });
    return;
  }

  // ── setstat ────────────────────────────────────────────────────────────────
  if (sub === 'setstat') {
    const user = interaction.options.getUser('kullanici', true);
    const stat = interaction.options.getString('stat', true);
    const value = interaction.options.getInteger('deger', true);
    const owl = await ctx.prisma.owl.findFirst({ where: { ownerId: user.id, isMain: true } });
    if (!owl) { await interaction.reply({ content: `❌ <@${user.id}> main baykusu yok.`, flags: 64 }); return; }

    await ctx.prisma.owl.update({ where: { id: owl.id }, data: { [stat]: value } });
    await interaction.reply({ content: `✅ <@${user.id}> **${stat}** → **${value}** olarak ayarlandı. ⚡`, flags: 64 });
    return;
  }

  // ── resetowl ───────────────────────────────────────────────────────────────
  if (sub === 'resetowl') {
    const user = interaction.options.getUser('kullanici', true);
    const owl = await ctx.prisma.owl.findFirst({ where: { ownerId: user.id, isMain: true } });
    if (!owl) { await interaction.reply({ content: `❌ <@${user.id}> main baykusu yok.`, flags: 64 }); return; }

    await ctx.prisma.owl.update({
      where: { id: owl.id },
      data: { statGaga: 1, statGoz: 1, statKulak: 1, statKanat: 1, statPence: 1, bond: 0, hp: owl.hpMax, staminaCur: owl.hpMax },
    });
    await interaction.reply({ content: `✅ <@${user.id}> baykuş statları sıfırlandı. 🦉`, flags: 64 });
    return;
  }

  // ── additem ────────────────────────────────────────────────────────────────
  if (sub === 'additem') {
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

  // ── removeitem ─────────────────────────────────────────────────────────────
  if (sub === 'removeitem') {
    const user = interaction.options.getUser('kullanici', true);
    const itemName = interaction.options.getString('item', true);
    const item = await ctx.prisma.inventoryItem.findFirst({ where: { ownerId: user.id, itemName } });
    if (!item) { await interaction.reply({ content: `❌ <@${user.id}> envanterinde **${itemName}** yok.`, flags: 64 }); return; }

    await ctx.prisma.inventoryItem.delete({ where: { id: item.id } });
    await interaction.reply({ content: `✅ <@${user.id}> envanterinden **${itemName}** silindi. 🗑️`, flags: 64 });
    return;
  }

  // ── clearinventory ─────────────────────────────────────────────────────────
  if (sub === 'clearinventory') {
    const user = interaction.options.getUser('kullanici', true);
    const count = await ctx.prisma.inventoryItem.count({ where: { ownerId: user.id } });
    await ctx.prisma.inventoryItem.deleteMany({ where: { ownerId: user.id } });
    await interaction.reply({ content: `✅ <@${user.id}> envanteri temizlendi. (${count} item silindi) 🗑️`, flags: 64 });
    return;
  }

  // ── clearcooldown ──────────────────────────────────────────────────────────
  if (sub === 'clearcooldown') {
    const user = interaction.options.getUser('kullanici', true);
    await ctx.redis.del(`cooldown:hunt:${user.id}`);
    await interaction.reply({ content: `✅ <@${user.id}> hunt cooldown temizlendi. ⏰`, flags: 64 });
    return;
  }

  // ── clearallcooldowns ──────────────────────────────────────────────────────
  if (sub === 'clearallcooldowns') {
    const keys = await ctx.redis.keys('cooldown:hunt:*');
    if (keys.length > 0) await ctx.redis.del(...keys);
    await interaction.reply({ content: `✅ ${keys.length} hunt cooldown temizlendi. ⏰`, flags: 64 });
    return;
  }

  // ── clearupgradecooldown ───────────────────────────────────────────────────
  if (sub === 'clearupgradecooldown') {
    const user = interaction.options.getUser('kullanici', true);
    await ctx.redis.del(`cooldown:upgrade:${user.id}`);
    await interaction.reply({ content: `✅ <@${user.id}> upgrade cooldown temizlendi. ⏰`, flags: 64 });
    return;
  }

  // ── serverinfo ─────────────────────────────────────────────────────────────
  if (sub === 'serverinfo') {
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
    topPlayers.forEach((p, i) => {
      t += `${i + 1}. <@${p.id}> — Lv.**${p.level}** | **${p.coins}** 💰\n`;
    });
    await interaction.reply({ content: t, flags: 64 });
    return;
  }

  // ── broadcast ──────────────────────────────────────────────────────────────
  if (sub === 'broadcast') {
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

    // \n literal'ini gerçek satır sonuna çevir, ardından her satırı işle
    const satirlar = mesajRaw
      .replace(/\\n/g, '\n')
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Liste satırları: - veya • ile başlayanları bullet'a çevir, diğerleri düz metin
    const formatliMetin = satirlar
      .map((s) => {
        if (/^[-•*]\s/.test(s)) return `> ${s.replace(/^[-•*]\s/, '• ')}`;
        if (/^\d+\.\s/.test(s)) return `> ${s}`; // numaralı liste
        return s;
      })
      .join('\n');

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(`📢 ${baslik}`)
      .setDescription(formatliMetin)
      .setTimestamp();

    if (footer) {
      embed.setFooter({ text: footer });
    }

    // Önizleme — sadece admin görür
    await interaction.reply({
      content: `📋 **Önizleme** — ${players.length} oyuncuya gönderilecek:`,
      embeds: [embed],
      flags: 64,
    });

    const players = await ctx.prisma.player.findMany({ select: { id: true } });
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

  // ── siralama — rolleri otomatik olustur ───────────────────────────────────
  if (sub === 'siralama') {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({ content: `❌ Bu komut sadece sunucuda kullanılabilir.`, flags: 64 });
      return;
    }
    await interaction.deferReply({ flags: 64 });
    const embed = await createLeaderboardRoles(interaction.guild, ctx.redis);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // ── lbcache ────────────────────────────────────────────────────────────────
  if (sub === 'lbcache') {
    await invalidateLeaderboardCache(ctx.redis);
    await interaction.reply({ content: `✅ Liderboard cache temizlendi. Bir sonraki sorgu DB'den yüklenecek.`, flags: 64 });
    return;
  }

  // ── lbseason ───────────────────────────────────────────────────────────────
  if (sub === 'lbseason') {
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

  // ── lbreset ────────────────────────────────────────────────────────────────
  if (sub === 'lbreset') {
    await interaction.reply({ content: `⚠️ Sezon sıfırlanıyor... Bu işlem geri alınamaz.`, flags: 64 });
    const archivedId = await archiveAndResetSeason(ctx.prisma, ctx.redis);
    await interaction.followUp({ content: `✅ Sezon **${archivedId}** arşivlendi. Yeni sezon başladı.`, flags: 64 });
    return;
  }

  // ── lbsyncroles ────────────────────────────────────────────────────────────
  if (sub === 'lbsyncroles') {
    if (!interaction.guildId) {
      await interaction.reply({ content: `❌ Bu komut sadece sunucuda kullanılabilir.`, flags: 64 });
      return;
    }
    await interaction.reply({ content: `🔄 Roller senkronize ediliyor...`, flags: 64 });
    await syncAllRoles(interaction.client, interaction.guildId, ctx.prisma, ctx.redis);
    await interaction.followUp({ content: `✅ Tüm liderboard rolleri güncellendi.`, flags: 64 });
    return;
  }
  // ── lbrefreshscore ─────────────────────────────────────────────────────────
  if (sub === 'lbrefreshscore') {
    const user = interaction.options.getUser('kullanici', true);
    const score = await refreshPowerScore(ctx.prisma, user.id);
    await interaction.reply({ content: `✅ <@${user.id}> power score güncellendi: **${score.toLocaleString('tr-TR')}**`, flags: 64 });
    return;
  }

  // ── lbbackfill ─────────────────────────────────────────────────────────────
  if (sub === 'lbbackfill') {
    await interaction.reply({ content: `⏳ Backfill başlatılıyor, tüm oyuncular işleniyor...`, flags: 64 });
    const { updated } = await backfillLeaderboardStats(ctx.prisma);
    await invalidateLeaderboardCache(ctx.redis);
    await interaction.followUp({
      content: `✅ **${updated}** oyuncunun liderboard verisi güncellendi.\nCache temizlendi — \`owl top\` ile kontrol edebilirsin.`,
      flags: 64,
    });
    return;
  }

  // ── testtame ───────────────────────────────────────────────────────────────
  if (sub === 'testtame') {
    await handleTestTame(interaction, ctx);
    return;
  }
}

export default { data, execute } satisfies CommandDefinition;

