/**
 * İstemci yedek — API context döndürmezse panel buradan doldurur.
 */
(function (global) {
  const MAP = {
    'slot.header': { status: 'live', statusLabel: 'Slot yardım / ödeme tablosu', command: 'w slot (yardım)', when: 'Slot bilgi/yardım gösterilince', where: 'Komut kanalı', how: 'Tek düz metin — custom emoji ödeme tablosu' },
    'slot.spin.intro': { status: 'live', statusLabel: 'Slot spin animasyonu', command: 'w slot [miktar]', when: 'Bahisli slot başlayınca', where: 'Komut kanalı (herkese açık)', how: 'reply → makara durunca message.edit() → son edit sonuç' },
    'slot.result.headline': { status: 'live', statusLabel: 'Slot sonuç ekranı', command: 'w slot [miktar]', when: '3 makara durduktan sonra', where: 'Aynı mesaj (son edit)', how: 'Sonuç + emoji makaralar + coin satırı' },
    'slot.pvp.vs': { status: 'live', statusLabel: 'PvP slot spin', command: 'w slot @oyuncu [miktar]', when: 'PvP slot kabul edilince', where: 'Komut kanalı', how: '🎰 PVP SLOT + makara animasyonu' },
    'slot.pvp.result': { status: 'live', statusLabel: 'PvP slot sonuç', command: 'w slot @oyuncu [miktar]', when: 'Animasyon bitince', where: 'Aynı mesaj (son edit)', how: '🏆 kazanan + makara + coin' },
    'cf.spin.intro': { status: 'live', statusLabel: 'Coinflip spin', command: 'w cf [miktar] [yazi|tura]', when: 'CF başlayınca (gif süresi)', where: 'Komut kanalı', how: 'Tek mesaj + CoinSpin gif → edit ile sonuç' },
    'cf.result.intro': { status: 'live', statusLabel: 'Coinflip sonuç', command: 'w cf [miktar]', when: 'Gif + DB bitince', where: 'Aynı mesaj (edit)', how: 'YAZI/TURA + coin satırı' },
    'cf.pvp.spinning': { status: 'live', statusLabel: 'PvP CF spin', command: 'w pvp @rakip cf [miktar]', when: 'PvP CF başlayınca', where: 'Komut kanalı', how: 'vs + dönen para gif' },
    'cf.pvp.result': { status: 'live', statusLabel: 'PvP CF sonuç', command: 'w pvp @rakip cf', when: 'PvP CF bitince', where: 'Komut kanalı', how: 'Kazanan + yüz + coin özeti' },
    'duel.vs': { status: 'live', statusLabel: 'Düello VS metni', command: 'w duel @rakip', when: 'Kabul sonrası kart animasyonu', where: 'Kanal (+ PNG kart eki)', how: 'Kısa VS satırı; asıl bilgi kart PNG\'de' },
    'duel.start': { status: 'live', statusLabel: 'Savaş başlıyor', command: 'w duel @rakip', when: 'Kabul butonundan hemen sonra', where: 'Kanal', how: 'Geçici metin → kart animasyonu' },
    'duel.result': { status: 'live', statusLabel: 'Düello kazanan', command: 'w duel @rakip', when: 'Kart animasyonu bitince', where: 'Kanal', how: '🏆 **kazanan** düelloyu kazandı.' },
    'duel.card.vs': { status: 'live', statusLabel: 'Savaş kartı PNG', command: 'w duel @rakip', when: 'Her animasyon karesi', where: 'Mesaj eki (attachment)', how: '1280×504 PNG — HP, stat, hasar balonu' },
    'hunt.result.final': { status: 'live', statusLabel: 'Av sonucu', command: 'w hunt', when: 'Av RNG + DB bitince', where: 'Kanal reply', how: 'Loot grupları + XP/coin + buff' },
    'flow.cooldown.hunt': { status: 'live', statusLabel: 'Av cooldown ipucu', command: 'w hunt (CD varken)', when: 'Cooldown sırasında tekrar hunt', where: 'Kanal', how: 'Yumuşak uyarı + kalan süre' },
    'flow.lost.footer': { status: 'live', statusLabel: 'Yeni oyuncu ipucu', command: 'çeşitli (flow middleware)', when: 'Belirli akışlarda', where: 'Mesaj altı', how: 'Avlan→sat→geliştir yönlendirmesi' },
    'tame.ui.encounter': { status: 'live', statusLabel: 'Tame tur embed', command: 'w hunt → Evcilleştir', when: 'Her tame aksiyonu sonrası', where: 'Embed + aksiyon butonları', how: 'Progress/kaçış barları, kişilik, footer ipucu' },
    'tame.result.success': { status: 'live', statusLabel: 'Tame başarı', command: 'tame oturumu', when: 'Evcilleştirme başarılı', where: 'Kanal düz metin', how: 'Özet + inventory ipucu' },
    'tame.result.fail': { status: 'live', statusLabel: 'Tame kaçış', command: 'tame oturumu', when: 'Kaçış veya timeout', where: 'Kanal', how: 'Kısa fail mesajı' },
    'encounter.ui.embed': { status: 'live', statusLabel: 'Yabani karşılaşma', command: 'w hunt → yabani spawn', when: 'Yabani baykuş çıkınca', where: 'Embed + Savaş/Kaç', how: 'Stat karşılaştırma, ödül tahmini' },
    'encounter.fight.result': { status: 'live', statusLabel: 'Savaş sonucu', command: 'Savaş butonu', when: 'Savaş RNG bitince', where: 'Kanal', how: 'Kazan/kaybet + ganimet' },
    'reward.daily.sample': { status: 'live', statusLabel: 'Günlük ödül tam mesaj', command: 'w daily', when: 'Daily claim', where: 'Kanal', how: 'Headline + XP/coin + level' },
    'reward.headline.daily': { status: 'live', statusLabel: 'Daily headline', command: 'w daily', when: 'Daily claim', where: 'Kanal', how: 'Üst satır şablon' },
    'reward.headline.sell': { status: 'live', statusLabel: 'Sell headline', command: 'w sell all', when: 'Toplu satış', where: 'Kanal', how: 'Headline + coin' },
    'reward.headline.quest': { status: 'live', statusLabel: 'Quest headline', command: 'görev claim', when: 'Görev ödülü', where: 'Kanal', how: 'Kısa headline' },
    'pvp.bj.high-stakes': { status: 'live', statusLabel: 'Yüksek bahis BJ', command: 'w bj @oyuncu', when: 'Bahis eşiği üstü', where: 'Kanal ek mesaj', how: 'BÜYÜK BET duyurusu' },
    'pvp.bj.game': { status: 'live', statusLabel: 'PvP BJ oyun', command: 'w bj @oyuncu', when: 'PvP BJ sırasında', where: 'Kanal + butonlar', how: 'Hit/Stand ekranı' },
    'pvp.bj.result': { status: 'live', statusLabel: 'PvP BJ sonuç', command: 'w bj @oyuncu', when: 'El bitince', where: 'Kanal', how: 'Kazanan + coin özeti' },
    'pvp.accept.start': { status: 'live', statusLabel: 'Kabul geçişi', command: 'w cf/slot/bj @oyuncu', when: 'Kabul edilince', where: 'Davet mesajı', how: 'vs satırı' },
    'duelbet.invite': { status: 'live', statusLabel: 'Bahisli düello daveti', command: 'w duelbet @oyuncu', when: 'Davet gönderilince', where: 'Kanal + butonlar', how: 'Bahis/pot/güç özeti' },
    'encounter.fight.result.lose': { status: 'live', statusLabel: 'Savaş kaybı', command: 'Savaş butonu', when: 'Kaybedilince', where: 'Kanal', how: 'Kayıp özeti' },
    'moon.evolution.message': { status: 'live', statusLabel: 'Ay evrimi', command: 'w upgrade', when: 'Moon tier geçince', where: 'Follow-up', how: 'Tam evrim mesajı + flavor' },
    'system.inflight.busy': { status: 'live', statusLabel: 'Komut meşgul', command: 'w cf / w slot (spin sürerken)', when: 'Spin bitmeden tekrar', where: 'Kanal', how: 'Kısa ⏱️ uyarı' },
    'system.spam.mute': { status: 'live', statusLabel: 'Spam susturma', command: 'herhangi', when: 'Spam algı', where: 'Kanal', how: 'Süreli uyarı' },
    'system.error.generic': { status: 'live', statusLabel: 'Genel hata', command: 'herhangi', when: 'Sunucu hatası', where: 'Kanal', how: 'Güvenli generic mesaj' },
    'bj.resume.note': { status: 'live', statusLabel: 'BJ devam eden el', command: 'w bj', when: 'Yarım el varken tekrar bj', where: 'Embed altı alıntı', how: 'Hit/Stand embed devam' },
    'bj.play.note': { status: 'live', statusLabel: 'BJ yeni el', command: 'w bj [miktar]', when: 'Yeni el', where: 'Embed altı', how: '60s timeout ipucu' },
    'bj.natural21.note': { status: 'live', statusLabel: 'BJ 21', command: 'w bj', when: 'Oyuncu 21 olunca', where: 'Embed altı', how: 'Krupiyer geçiş notu' },
  };

  const MOON_LABELS = ['', 'Moon I', 'Moon II', 'Moon III', 'Moon IV', 'Moon V', 'Moon VI', 'Moon VII'];
  const LB = { power: 'Güç liderboard birincisi', pvp: 'PvP liderboard birincisi', wealth: 'Servet liderboard birincisi' };
  const CD_CMDS = { hunt: 'w hunt', duel: 'w duel', slot: 'w slot', blackjack: 'w bj', coinflip: 'w cf', pvp_gamble: 'w pvp', upgrade: 'w upgrade', transfer: 'w transfer' };

  function resolve(entry) {
    const base = MAP[entry.id];
    if (base) return { ...base, sourceFile: entry.sourceFile };

    const id = entry.id;
    if (id.startsWith('pvp.invite.embed.')) {
      const mode = id.replace('pvp.invite.embed.', '');
      const cmd = mode === 'blackjack' ? 'w bj @oyuncu [miktar]' : `w ${mode} @oyuncu [miktar]`;
      return {
        status: 'live', statusLabel: 'PvP kumar davet embed\'i', command: cmd,
        when: 'Davet gönderilince', where: 'Kanal + butonlar',
        how: 'Embed bahis/kasa + Kabul/Reddet/İptal', sourceFile: entry.sourceFile,
      };
    }
    if (id.startsWith('moon.tier.') && id.endsWith('.flavor')) {
      const tier = Number(id.replace('moon.tier.', '').replace('.flavor', ''));
      const label = MOON_LABELS[tier] ?? `Moon ${tier}`;
      return {
        status: 'live',
        statusLabel: `Ay evrimi flavor — ${label}`,
        command: 'w upgrade',
        when: `${label} evriminde`,
        where: 'Ay evrimi mesajında flavor satırı',
        how: 'buildMoonEvolutionMessage() flavor satırı',
        sourceFile: entry.sourceFile,
      };
    }
    if (id.startsWith('roles.steal.') && id.endsWith('.headline')) {
      const kind = id.split('.')[2] ?? 'power';
      return {
        status: 'live', statusLabel: 'Taht değişimi duyurusu', command: '(otomatik — w lb sıralaması)',
        when: `${LB[kind] ?? kind} değişince`, where: 'Sunucu duyuru kanalı',
        how: 'Embed: büyük başlık + yeni #1 + tagline alıntı', sourceFile: entry.sourceFile,
      };
    }
    if (id.startsWith('system.cooldown.')) {
      const action = id.replace('system.cooldown.', '');
      return {
        status: 'live', statusLabel: 'Cooldown uyarısı', command: CD_CMDS[action] ?? 'çeşitli',
        when: 'Cooldown aktifken aynı komut tekrar', where: 'Komut kanalı',
        how: '⏱️ | **isim**, yavaşla~ + kalan süre + tekrar ne zaman', sourceFile: entry.sourceFile,
      };
    }
    return {
      status: 'live', statusLabel: 'Bot mesajı',
      command: (entry.trigger || entry.category || '').slice(0, 60),
      when: entry.trigger || '—', where: 'Kanal mesajı',
      how: entry.previewKind === 'embed' || entry.previewKind === 'composite' ? 'Embed / ek' : 'Düz metin',
      sourceFile: entry.sourceFile,
    };
  }

  global.resolveCopyContext = resolve;
})(typeof window !== 'undefined' ? window : globalThis);
