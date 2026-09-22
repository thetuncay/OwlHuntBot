/**
 * Bot çıktısı bağlamı — ne zaman, nerede, nasıl (panel + API).
 */
import type { CopyCatalogEntry } from './copy-catalog';

export interface CopyEntryContext {
  status: 'live' | 'config' | 'disabled';
  statusLabel: string;
  command: string;
  when: string;
  where: string;
  how: string;
  sourceFile: string;
}

function c(
  partial: Omit<CopyEntryContext, 'sourceFile'>,
  sourceFile: string,
): CopyEntryContext {
  return { sourceFile, ...partial };
}

const MAP: Record<string, Omit<CopyEntryContext, 'sourceFile'>> = {
  'slot.header': {
    status: 'live', statusLabel: 'Slot yardım / ödeme tablosu',
    command: 'w slot (yardım)',
    when: 'Slot bilgi/yardım gösterilince',
    where: 'Komut kanalı',
    how: 'Tek düz metin — custom emoji ödeme tablosu',
  },
  'slot.spin.intro': {
    status: 'live', statusLabel: 'Slot spin animasyonu',
    command: 'w slot [miktar]',
    when: 'Bahisli slot başlayınca, sonuç beklerken',
    where: 'Komut kanalı (herkese açık)',
    how: 'reply → her makara durunca message.edit() → son edit sonuç',
  },
  'slot.result.headline': {
    status: 'live', statusLabel: 'Slot sonuç ekranı',
    command: 'w slot [miktar]',
    when: '3 makara durduktan sonra',
    where: 'Aynı mesaj (son edit)',
    how: '┃ Sonuç + emoji makaralar + coin satırı',
  },
  'slot.pvp.vs': {
    status: 'live', statusLabel: 'PvP slot spin',
    command: 'w slot @oyuncu [miktar]',
    when: 'PvP slot kabul edilince, makaralar dönerken',
    where: 'Komut kanalı',
    how: '🎰 PVP SLOT + iki oyuncu makara satırı (edit animasyonu)',
  },
  'slot.pvp.result': {
    status: 'live', statusLabel: 'PvP slot sonuç',
    command: 'w slot @oyuncu [miktar]',
    when: 'PvP slot animasyonu bitince',
    where: 'Aynı mesaj (son edit)',
    how: '🏆 kazanan + makara özeti + coin delta (+ combo/teselli varsa)',
  },
  'cf.spin.intro': {
    status: 'live', statusLabel: 'Coinflip spin',
    command: 'w cf [miktar] [yazi|tura]',
    when: 'CF başlayınca (gif süresi)',
    where: 'Komut kanalı',
    how: 'Tek mesaj + CoinSpin gif → edit ile sonuç',
  },
  'cf.result.intro': {
    status: 'live', statusLabel: 'Coinflip sonuç',
    command: 'w cf [miktar]',
    when: 'Gif + DB bitince',
    where: 'Aynı mesaj (edit)',
    how: 'YAZI/TURA + coin satırı',
  },
  'cf.pvp.spinning': {
    status: 'live', statusLabel: 'PvP CF spin',
    command: 'w pvp @rakip cf [miktar]',
    when: 'PvP CF başlayınca',
    where: 'Komut kanalı',
    how: 'vs + dönen para gif',
  },
  'cf.pvp.result': {
    status: 'live', statusLabel: 'PvP CF sonuç',
    command: 'w pvp @rakip cf',
    when: 'PvP CF bitince',
    where: 'Komut kanalı',
    how: 'Kazanan + yüz + coin özeti',
  },
  'duel.vs': {
    status: 'live', statusLabel: 'Düello VS metni',
    command: 'w duel @rakip',
    when: 'Kabul sonrası kart animasyonu',
    where: 'Kanal (+ PNG kart eki)',
    how: 'Kısa VS satırı; asıl bilgi kart PNG\'de',
  },
  'duel.start': {
    status: 'live', statusLabel: 'Savaş başlıyor',
    command: 'w duel @rakip',
    when: 'Kabul butonundan hemen sonra',
    where: 'Kanal',
    how: 'Geçici metin → kart animasyonu',
  },
  'duel.result': {
    status: 'live', statusLabel: 'Düello kazanan',
    command: 'w duel @rakip',
    when: 'Kart animasyonu bitince',
    where: 'Kanal',
    how: '🏆 **kazanan** düelloyu kazandı.',
  },
  'duel.card.vs': {
    status: 'live', statusLabel: 'Savaş kartı PNG',
    command: 'w duel @rakip',
    when: 'Her animasyon karesi',
    where: 'Mesaj eki (attachment)',
    how: '1280×504 PNG — HP, stat, hasar balonu',
  },
  'hunt.result.final': {
    status: 'live', statusLabel: 'Av sonucu',
    command: 'w hunt',
    when: 'Av RNG + DB bitince',
    where: 'Kanal reply',
    how: 'Loot grupları + XP/coin + buff',
  },
  'flow.cooldown.hunt': {
    status: 'live', statusLabel: 'Av cooldown ipucu',
    command: 'w hunt (CD varken)',
    when: 'Cooldown sırasında tekrar hunt',
    where: 'Kanal',
    how: 'Yumuşak uyarı + kalan süre',
  },
  'flow.lost.footer': {
    status: 'live', statusLabel: 'Yeni oyuncu ipucu',
    command: 'çeşitli (flow middleware)',
    when: 'Belirli akışlarda',
    where: 'Mesaj altı',
    how: 'Avlan→sat→geliştir yönlendirmesi',
  },
  'tame.ui.encounter': {
    status: 'live', statusLabel: 'Tame tur embed',
    command: 'w hunt → Evcilleştir',
    when: 'Her tame aksiyonu sonrası',
    where: 'Embed + aksiyon butonları',
    how: 'Progress/kaçış barları, kişilik, footer ipucu',
  },
  'tame.result.success': {
    status: 'live', statusLabel: 'Tame başarı',
    command: 'tame oturumu',
    when: 'Evcilleştirme başarılı',
    where: 'Kanal düz metin',
    how: 'Özet + inventory ipucu',
  },
  'tame.result.fail': {
    status: 'live', statusLabel: 'Tame kaçış',
    command: 'tame oturumu',
    when: 'Kaçış veya timeout',
    where: 'Kanal',
    how: 'Kısa fail mesajı',
  },
  'encounter.ui.embed': {
    status: 'live', statusLabel: 'Yabani karşılaşma',
    command: 'w hunt → yabani spawn',
    when: 'Yabani baykuş çıkınca',
    where: 'Embed + Savaş/Kaç',
    how: 'Stat karşılaştırma, ödül tahmini',
  },
  'encounter.fight.result': {
    status: 'live', statusLabel: 'Savaş sonucu',
    command: 'Savaş butonu',
    when: 'Savaş RNG bitince',
    where: 'Kanal',
    how: 'Kazan/kaybet + ganimet',
  },
  'reward.daily.sample': {
    status: 'live', statusLabel: 'Günlük ödül tam mesaj',
    command: 'w daily',
    when: 'Daily claim',
    where: 'Kanal',
    how: 'Headline + XP/coin + level',
  },
  'reward.headline.daily': {
    status: 'live', statusLabel: 'Daily headline',
    command: 'w daily',
    when: 'Daily claim',
    where: 'Kanal',
    how: 'Üst satır şablon',
  },
  'reward.headline.sell': {
    status: 'live', statusLabel: 'Sell headline',
    command: 'w sell all',
    when: 'Toplu satış',
    where: 'Kanal',
    how: 'Headline + coin',
  },
  'reward.headline.quest': {
    status: 'live', statusLabel: 'Quest headline',
    command: 'görev claim',
    when: 'Görev ödülü',
    where: 'Kanal',
    how: 'Kısa headline',
  },
  'pvp.bj.high-stakes': {
    status: 'live', statusLabel: 'Yüksek bahis BJ duyurusu',
    command: 'w bj @oyuncu [miktar]',
    when: 'Bahis eşiği üstü PvP BJ',
    where: 'Sunucu kanalı ek mesaj',
    how: '### BÜYÜK BET + bahis + izleme alıntısı',
  },
  'pvp.bj.game': {
    status: 'live', statusLabel: 'PvP BJ oyun ekranı',
    command: 'w bj @oyuncu [miktar]',
    when: 'PvP BJ başlayınca ve her Hit/Stand sonrası',
    where: 'Komut kanalı + butonlar',
    how: '### Blackjack + iki el + Hit/Stand butonları',
  },
  'pvp.bj.result': {
    status: 'live', statusLabel: 'PvP BJ sonuç',
    command: 'w bj @oyuncu',
    when: 'PvP BJ el bitince',
    where: 'Aynı mesaj (edit)',
    how: 'Kazanan + iki el özeti + net coin + teselli',
  },
  'pvp.accept.start': {
    status: 'live', statusLabel: 'PvP kumar kabul geçişi',
    command: 'w cf/slot/bj @oyuncu',
    when: 'Rakip Kabul Et\'e basınca',
    where: 'Davet mesajı (edit)',
    how: 'Embed silinir → ⚔️ **challenger** vs **defender**',
  },
  'duelbet.invite': {
    status: 'live', statusLabel: 'Bahisli düello daveti',
    command: 'w duelbet @oyuncu [miktar]',
    when: 'Bahisli düello daveti gönderilince',
    where: 'Komut kanalı + Kabul/Reddet/İptal',
    how: 'Bahis, pot, güç, seri bilgisi + uyarı satırları',
  },
  'encounter.fight.result.lose': {
    status: 'live', statusLabel: 'Encounter savaş kaybı',
    command: 'Savaş butonu (kaybedilince)',
    when: 'Savaş RNG — oyuncu kaybedince',
    where: 'Kanal',
    how: 'Kayıp özeti + kazanma şansı + ipucu',
  },
  'moon.evolution.message': {
    status: 'live', statusLabel: 'Ay evrimi tam mesajı',
    command: 'w upgrade',
    when: 'Güç eşiği moon tier geçince',
    where: 'Komut kanalı follow-up (@oyuncu)',
    how: '✦✦✦ AY EVRİMİ ✦✦✦ + emoji okları + unlock + flavor satırı',
  },
  'system.inflight.busy': {
    status: 'live', statusLabel: 'Komut meşgul',
    command: 'w cf / w slot (spin sürerken)',
    when: 'Spin bitmeden tekrar',
    where: 'Kanal',
    how: 'Kısa ⏱️ uyarı',
  },
  'system.spam.mute': {
    status: 'live', statusLabel: 'Spam susturma',
    command: 'herhangi',
    when: 'Spam algı',
    where: 'Kanal',
    how: 'Süreli uyarı',
  },
  'system.error.generic': {
    status: 'live', statusLabel: 'Genel hata',
    command: 'herhangi',
    when: 'Sunucu hatası',
    where: 'Kanal',
    how: 'Güvenli generic mesaj',
  },
  'bj.resume.note': {
    status: 'live', statusLabel: 'BJ devam eden el',
    command: 'w bj',
    when: 'Yarım el varken tekrar bj',
    where: 'Embed altı alıntı',
    how: 'Hit/Stand embed devam',
  },
  'bj.play.note': {
    status: 'live', statusLabel: 'BJ yeni el',
    command: 'w bj [miktar]',
    when: 'Yeni el',
    where: 'Embed altı',
    how: '60s timeout ipucu',
  },
  'bj.natural21.note': {
    status: 'live', statusLabel: 'BJ 21',
    command: 'w bj',
    when: 'Oyuncu 21 olunca',
    where: 'Embed altı',
    how: 'Krupiyer geçiş notu',
  },
  'bj.solo.game': {
    status: 'live', statusLabel: 'Solo BJ oyun ekranı',
    command: 'w bj [miktar]',
    when: 'Yeni el veya devam eden el',
    where: 'Komut kanalı + Hit/Stand butonları',
    how: '### Blackjack + krupiyer/oyuncu elleri + alt not',
  },
};

function moonFlavor(tier: number, label: string, sourceFile: string): CopyEntryContext {
  return c({
    status: 'live',
    statusLabel: `Ay evrimi flavor — ${label}`,
    command: 'w upgrade',
    when: `${label} evrimine geçilince`,
    where: 'Ay evrimi follow-up mesajında (flavor satırı)',
    how: `buildMoonEvolutionMessage() içinde unlock satırından sonra. Metin: owl-moon-tier.ts flavor alanı.`,
  }, sourceFile);
}

function leaderboardHeadline(kind: string, sourceFile: string): CopyEntryContext {
  const labels: Record<string, string> = {
    power: 'Güç liderboard birincisi',
    pvp: 'PvP liderboard birincisi',
    wealth: 'Servet liderboard birincisi',
  };
  return c({
    status: 'live',
    statusLabel: 'Taht değişimi duyurusu',
    command: '(otomatik — w lb sıralaması)',
    when: `${labels[kind] ?? kind} değişince`,
    where: 'Sunucu duyuru kanalı',
    how: 'Embed: büyük başlık + yeni #1 + tagline alıntı',
  }, sourceFile);
}

function cooldown(action: string, cmd: string, sourceFile: string): CopyEntryContext {
  return c({
    status: 'live',
    statusLabel: 'Cooldown uyarısı',
    command: cmd,
    when: 'Cooldown aktifken aynı komut tekrar',
    where: 'Komut kanalı',
    how: '⏱️ | **isim**, yavaşla~ + kalan süre + tekrar ne zaman',
  }, sourceFile);
}

export function resolveEntryContext(entry: CopyCatalogEntry): CopyEntryContext {
  const base = MAP[entry.id];
  if (base) return c(base, entry.sourceFile);

  const id = entry.id;
  if (id.startsWith('pvp.invite.embed.')) {
    const mode = id.replace('pvp.invite.embed.', '');
    const cmd = mode === 'blackjack' ? 'w bj @oyuncu [miktar]' : `w ${mode} @oyuncu [miktar]`;
    return c({
      status: 'live',
      statusLabel: 'PvP kumar davet embed\'i',
      command: cmd,
      when: 'Davet gönderilince',
      where: 'Komut kanalı + Kabul/Reddet/İptal butonları',
      how: 'Embed: bahis, kasa payı, kazanılabilir + footer 30sn',
    }, entry.sourceFile);
  }
  if (id.startsWith('moon.tier.')) {
    const tier = Number(id.replace('moon.tier.', '').replace('.flavor', ''));
    const labels = ['', 'Moon I', 'Moon II', 'Moon III', 'Moon IV', 'Moon V', 'Moon VI', 'Moon VII'];
    return moonFlavor(tier, labels[tier] ?? `Moon ${tier}`, entry.sourceFile);
  }
  if (id.startsWith('roles.steal.') && id.endsWith('.headline')) {
    return leaderboardHeadline(id.split('.')[2] ?? 'power', entry.sourceFile);
  }
  if (id.startsWith('system.cooldown.')) {
    const action = id.replace('system.cooldown.', '');
    const cmds: Record<string, string> = {
      hunt: 'w hunt', duel: 'w duel', slot: 'w slot', blackjack: 'w bj',
      coinflip: 'w cf', pvp_gamble: 'w pvp', upgrade: 'w upgrade',
      transfer: 'w transfer',
    };
    return cooldown(action, cmds[action] ?? 'çeşitli', entry.sourceFile);
  }

  return c({
    status: 'live',
    statusLabel: 'Bot mesajı',
    command: entry.trigger.slice(0, 40) || entry.category,
    when: entry.trigger,
    where: 'Kanal mesajı',
    how: entry.previewKind === 'embed' || entry.previewKind === 'composite' ? 'Embed / ek' : 'Düz metin',
  }, entry.sourceFile);
}

export type CopyCatalogEntryWithContext = CopyCatalogEntry & { context: CopyEntryContext };

export function attachEntryContext(entry: CopyCatalogEntry): CopyCatalogEntryWithContext {
  return { ...entry, context: resolveEntryContext(entry) };
}

export function attachContextToEntries(entries: CopyCatalogEntry[]): CopyCatalogEntryWithContext[] {
  return entries.map(attachEntryContext);
}
