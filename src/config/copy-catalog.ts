/**
 * Bot çıktı metinleri kataloğu — Copy Editor paneli buradan beslenir.
 * Düzeltilmiş metinler data/copy-overrides.json içinde tutulur (henüz bota uygulanmaz).
 */
import { OWL_MOON_TIERS } from './owl-moon-tier';
import { SIM_PVP_PLAYER_OWL_FLAVOR } from '../config';
import {
  CRITICAL_FAIL_TEXTS,
  CRITICAL_SUCCESS_TEXTS,
  ENDING_TEXTS,
  FAIL_TEXTS,
  HINT_TEXTS,
  INTRO_TEXTS,
  REACTION_TEXTS,
  SUCCESS_TEXTS,
} from '../utils/tame-texts';
import type { DiscordPreviewPayload } from './discord-preview-types';
import { appendExtendedCopyCatalog } from './copy-catalog-extended';
import {
  msgPayload,
  sampleCoinFlipResult,
  sampleCoinFlipSpin,
  samplePvpCoinFlipResult,
  samplePvpCoinFlipSpin,
  samplePvpInviteEmbed,
  samplePvpSlotResult,
  samplePvpSlotSpin,
  sampleSlotHelp,
  sampleSlotResult,
  sampleSlotSpin,
  SAMPLE_OPPONENT,
  SAMPLE_PLAYER,
} from './copy-preview-samples';

import type { OwlPersonality, TameAction } from '../utils/tame-narrative';

export type CopyPreviewKind = 'message' | 'embed' | 'embed-description' | 'composite';

export interface CopyCatalogEntry {
  id: string;
  category: string;
  label: string;
  sourceFile: string;
  trigger: string;
  current: string;
  previewKind: CopyPreviewKind;
  /** Discord birebir önizleme — builder çıktısı */
  previewPayload: DiscordPreviewPayload;
  /** @deprecated previewPayload kullanın */
  previewSample: string;
  tags?: string[];
}

function msg(lines: string[]): string {
  return lines.join('\n');
}

function discordMessage(body: string, botName = 'OwlHunt-test'): string {
  return `[${botName}]\n${body}`;
}

function discordEmbed(title: string, description: string, color = '#f59e0b'): string {
  return `[Embed · ${color}]\n${title}\n${description}`;
}

function payloadFromLegacy(partial: {
  previewPayload?: DiscordPreviewPayload;
  previewSample?: string;
  current: string;
}): DiscordPreviewPayload {
  if (partial.previewPayload) return partial.previewPayload;
  const raw = partial.previewSample ?? partial.current;
  const embedMatch = raw.match(/^\[Embed · #?([0-9a-fA-F]{6})\]\n([\s\S]*)$/);
  if (embedMatch) {
    const [, colorHex, rest] = embedMatch;
    const [title, ...descLines] = rest!.split('\n');
    return {
      embeds: [{
        title: title ?? undefined,
        description: descLines.join('\n') || undefined,
        color: parseInt(colorHex!, 16),
      }],
    };
  }
  const body = raw.replace(/^\[OwlHunt-test\]\n/, '');
  return msgPayload(body);
}

function pushEntry(
  out: CopyCatalogEntry[],
  partial: Omit<CopyCatalogEntry, 'previewSample' | 'previewPayload'> & {
    previewSample?: string;
    previewPayload?: DiscordPreviewPayload;
  },
): void {
  const previewPayload = payloadFromLegacy(partial);
  const previewSample = partial.previewSample
    ?? previewPayload.content
    ?? previewPayload.embeds?.[0]?.description
    ?? partial.current;
  out.push({ ...partial, previewPayload, previewSample });
}

function pushStringPool(
  out: CopyCatalogEntry[],
  opts: {
    category: string;
    sourceFile: string;
    poolId: string;
    poolLabel: string;
    trigger: string;
    values: string[];
    previewKind?: CopyPreviewKind;
    previewWrap?: (text: string) => string;
  },
): void {
  opts.values.forEach((text, index) => {
    const wrap = opts.previewWrap ?? discordMessage;
    pushEntry(out, {
      id: `${opts.poolId}.${index}`,
      category: opts.category,
      label: `${opts.poolLabel} #${index + 1}`,
      sourceFile: opts.sourceFile,
      trigger: opts.trigger,
      current: text,
      previewKind: opts.previewKind ?? 'message',
      previewSample: wrap(text),
      tags: ['pool', opts.poolId],
    });
  });
}

function pushPersonalityPool(
  out: CopyCatalogEntry[],
  opts: {
    category: string;
    sourceFile: string;
    poolId: string;
    poolLabel: string;
    trigger: string;
    pool: Record<OwlPersonality, string[]>;
    previewWrap?: (text: string) => string;
  },
): void {
  for (const personality of Object.keys(opts.pool) as OwlPersonality[]) {
    opts.pool[personality]!.forEach((text, index) => {
      const wrap = opts.previewWrap ?? ((t) => discordMessage(`> ${t}`));
      pushEntry(out, {
        id: `${opts.poolId}.${personality}.${index}`,
        category: opts.category,
        label: `${opts.poolLabel} · ${personality} #${index + 1}`,
        sourceFile: opts.sourceFile,
        trigger: opts.trigger,
        current: text,
        previewKind: 'message',
        previewSample: wrap(text),
        tags: ['pool', opts.poolId, personality],
      });
    });
  }
}

function pushReactionPool(out: CopyCatalogEntry[]): void {
  for (const personality of Object.keys(REACTION_TEXTS) as OwlPersonality[]) {
    const actions = REACTION_TEXTS[personality]!;
    for (const action of Object.keys(actions) as TameAction[]) {
      actions[action]!.forEach((text, index) => {
        pushEntry(out, {
          id: `tame.reaction.${personality}.${action}.${index}`,
          category: 'Tame · Reaksiyon',
          label: `${personality} / ${action} #${index + 1}`,
          sourceFile: 'src/utils/tame-texts.ts',
          trigger: 'Tame aksiyonu sonrası embed gövdesi',
          current: text,
          previewKind: 'embed',
          previewSample: discordEmbed('🦉 Evcilleştirme', `> ${text}\n\n*İpucu metni burada*`),
          tags: ['pool', 'tame', personality, action],
        });
      });
    }
  }
}

function pushEndingPool(out: CopyCatalogEntry[]): void {
  for (const kind of Object.keys(ENDING_TEXTS) as Array<keyof typeof ENDING_TEXTS>) {
    ENDING_TEXTS[kind].forEach((text, index) => {
      pushEntry(out, {
        id: `tame.ending.${kind}.${index}`,
        category: 'Tame · Bitiş',
        label: `${kind} #${index + 1}`,
        sourceFile: 'src/utils/tame-texts.ts',
        trigger: 'Tame oturumu bittiğinde',
        current: text,
        previewKind: 'message',
        previewSample: discordMessage(text),
        tags: ['pool', 'tame', kind],
      });
    });
  }
}

/** Tüm düzenlenebilir metinler — statik + tame havuzları */
export function buildCopyCatalog(): CopyCatalogEntry[] {
  const out: CopyCatalogEntry[] = [];

  // ── Slot ──────────────────────────────────────────────────────────────────
  pushEntry(out, {
    id: 'slot.header',
    category: 'Slot',
    label: 'Başlık + ödeme tablosu',
    sourceFile: 'src/utils/slot-ux.ts',
    trigger: 'buildSlotHeader() + buildSlotPayoutHint() — yardım',
    current: '🎰SLOT MAKİNESİ + çarpan tablosu (w slot)',
    previewKind: 'message',
    previewPayload: sampleSlotHelp(),
  });
  pushEntry(out, {
    id: 'slot.spin.intro',
    category: 'Slot',
    label: 'Solo spin — tam ekran (gif makaralar)',
    sourceFile: 'src/utils/slot-ux.ts',
    trigger: '`w slot` ilk mesaj + dönüş animasyonu',
    current: '🎰SLOT MAKİNESİ + makaralar + oyuncu, bahis',
    previewKind: 'message',
    previewPayload: sampleSlotSpin(),
    tags: ['slop', 'ui'],
  });
  pushEntry(out, {
    id: 'slot.spin.spinning',
    category: 'Slot',
    label: 'Spin animasyon — alt satır',
    sourceFile: 'src/utils/slot-ux.ts',
    trigger: 'Makaralar dönerken her frame edit',
    current: '(ayrı alt satır yok — aynı ekran, makara duruşu)',
    previewKind: 'message',
    previewPayload: sampleSlotSpin(),
    tags: ['slop', 'ui', 'duplicate'],
  });
  pushEntry(out, {
    id: 'slot.result.headline',
    category: 'Slot',
    label: 'Sonuç — tam ekran',
    sourceFile: 'src/utils/slot-ux.ts',
    trigger: 'Slot sonuç ekranı (custom emoji makaralar)',
    current: '🎰SLOT MAKİNESİ + sonuç satırı (kazanç / kayıp)',
    previewKind: 'message',
    previewPayload: sampleSlotResult(),
    tags: ['ui'],
  });
  pushEntry(out, {
    id: 'slot.result.section',
    category: 'Slot',
    label: 'Sonuç — bölüm etiketi',
    sourceFile: 'src/utils/result-ux.ts',
    trigger: 'formatSignedCoinLine öncesi',
    current: '🎯 Sonuç',
    previewKind: 'message',
    previewSample: discordMessage('┃ 🎯 Sonuç'),
    tags: ['fragment'],
  });
  pushEntry(out, {
    id: 'slot.pvp.vs',
    category: 'Slot · PvP',
    label: 'PvP spin — tam ekran',
    sourceFile: 'src/utils/slot-ux.ts',
    trigger: 'PvP slot yarışması animasyon',
    current: '🎰 PVP SLOT',
    previewKind: 'message',
    previewPayload: samplePvpSlotSpin(),
    tags: ['ui'],
  });
  pushEntry(out, {
    id: 'slot.pvp.result',
    category: 'Slot · PvP',
    label: 'PvP sonuç — kazanan özeti',
    sourceFile: 'src/commands/pvp.ts → buildPvpSlotResultText',
    trigger: 'PvP slot animasyonu bitince — son edit',
    current: '🏆 {winner} kazandı.',
    previewKind: 'message',
    previewPayload: samplePvpSlotResult(),
    tags: ['ui'],
  });

  // ── Coinflip ──────────────────────────────────────────────────────────────
  pushEntry(out, {
    id: 'cf.spin.intro',
    category: 'Coinflip',
    label: 'Solo spin — tam ekran (gif para)',
    sourceFile: 'src/utils/coinflip-ux.ts',
    trigger: '`w cf` ilk mesaj — Discord gif emoji',
    current: '{player} {coin} {bet} harcadı ve “YAZI/TURA”yı seçti.',
    previewKind: 'message',
    previewPayload: sampleCoinFlipSpin(),
    tags: ['slop', 'ui'],
  });
  pushEntry(out, {
    id: 'cf.spin.spinning',
    category: 'Coinflip',
    label: 'Spin — dönüyor satırı',
    sourceFile: 'src/utils/coinflip-ux.ts',
    trigger: 'Coinflip gif oynarken (aynı mesaj)',
    current: 'Para dönüyor… {gif}',
    previewKind: 'message',
    previewPayload: sampleCoinFlipSpin(),
    tags: ['slop', 'ui', 'duplicate'],
  });
  pushEntry(out, {
    id: 'cf.result.intro',
    category: 'Coinflip',
    label: 'Sonuç — tam ekran',
    sourceFile: 'src/utils/coinflip-ux.ts',
    trigger: 'Coinflip sonuç edit',
    current: '{player} … Para dönüyor… {gif} ve {sonuç} KAZANDIN!! / KAYBETTİN',
    previewKind: 'message',
    previewPayload: sampleCoinFlipResult(),
    tags: ['slop', 'ui'],
  });
  pushEntry(out, {
    id: 'cf.pvp.spinning',
    category: 'Coinflip · PvP',
    label: 'PvP spin',
    sourceFile: 'src/utils/coinflip-ux.ts',
    trigger: 'PvP coinflip animasyon',
    current: '{coin} PVP CoinFlip + Head/Tails + Para dönüyor… {gif}',
    previewKind: 'message',
    previewPayload: samplePvpCoinFlipSpin(),
    tags: ['slop', 'ui'],
  });
  pushEntry(out, {
    id: 'cf.pvp.result',
    category: 'Coinflip · PvP',
    label: 'PvP sonuç',
    sourceFile: 'src/utils/coinflip-ux.ts',
    trigger: 'PvP coinflip bitince',
    current: 'Para döndü ve {yüz}, {kazanan} Kazandı!! {coin}',
    previewKind: 'message',
    previewPayload: samplePvpCoinFlipResult(),
    tags: ['ui'],
  });

  // ── PvP kumar davet ───────────────────────────────────────────────────────
  for (const [mode, label] of [
    ['coinflip', 'Coin Flip'],
    ['slot', 'Slot'],
    ['blackjack', 'Blackjack'],
  ] as const) {
    pushEntry(out, {
      id: `pvp.invite.embed.${mode}`,
      category: 'PvP Kumar · Davet',
      label: `${label} — davet embed + butonlar`,
      sourceFile: 'src/commands/pvp.ts → buildPvpInviteEmbed',
      trigger: `\`w ${mode === 'blackjack' ? 'bj' : mode} @oyuncu\` — davet mesajı`,
      current: '(embed + Kabul / Reddet / İptal)',
      previewKind: 'embed',
      previewPayload: samplePvpInviteEmbed(mode),
      tags: ['ui'],
    });
    pushEntry(out, {
      id: `pvp.invite.desc.${mode}`,
      category: 'PvP Kumar · Davet',
      label: `${label} — embed alıntı (opsiyonel)`,
      sourceFile: 'src/commands/pvp.ts → PVP_MODE_DESC',
      trigger: 'Davet embed description (> alıntı). Boş = gösterilmez.',
      current: '(boş — opsiyonel mod açıklaması)',
      previewKind: 'embed-description',
      previewSample: discordEmbed(
        `⚔️ PvP Daveti — ${label}`,
        '**Tuncay** seni meydan okumaya davet ediyor!\n> (mod açıklaması buraya)',
      ),
      tags: ['editable-hook'],
    });
  }
  pushEntry(out, {
    id: 'pvp.accept.start',
    category: 'PvP Kumar · Davet',
    label: 'Kabul sonrası geçiş mesajı',
    sourceFile: 'src/commands/pvp.ts → buildPvpGameStartMessage',
    trigger: 'Rakip Kabul Et\'e basınca embed silinir, bu metin gelir',
    current: '⚔️ **{challenger}** vs **{defender}**',
    previewKind: 'message',
    previewPayload: msgPayload('⚔️ **Tuncay** vs **Ali**'),
    tags: ['ui'],
  });
  pushEntry(out, {
    id: 'pvp.cf.streak',
    category: 'PvP Kumar · Davet',
    label: 'Coinflip seri kazanç duyurusu',
    sourceFile: 'src/commands/pvp.ts → buildPvpCfStreakAnnounce',
    trigger: 'PvP CF 3+ seri kazanç — ayrı kanal mesajı. null = kapalı',
    current: '(kapalı — mesaj gönderilmiyor)',
    previewKind: 'message',
    previewSample: discordMessage('(şu an gönderilmiyor)'),
    tags: ['editable-hook'],
  });
  pushEntry(out, {
    id: 'pvp.bj.high-stakes',
    category: 'PvP Kumar · Blackjack',
    label: 'Yüksek bahis duyurusu',
    sourceFile: 'src/commands/pvp.ts',
    trigger: 'PvP BJ bahis eşiği üstü — kanala ek mesaj',
    current: '### ⚠️ BÜYÜK BET ?!',
    previewKind: 'message',
    previewSample: discordMessage(
      '### ⚠️ BÜYÜK BET ?!\n─────────────────────\n**Tuncay** vs **Ali** \n💰 **Coin: 50.000** bahisli Blackjack başladı!\n> 👁️ Beti izlemek için tıkla..',
    ),
    tags: ['slop'],
  });

  // ── Düello ────────────────────────────────────────────────────────────────
  pushEntry(out, {
    id: 'duel.vs',
    category: 'Düello',
    label: 'VS satırı (kart üstü)',
    sourceFile: 'src/utils/pvp-ux.ts',
    trigger: 'Düello animasyonu — PNG kart üstü metin',
    current: '⚔️ **{challenger}** {owlEmoji}  vs  **{defender}** {owlEmoji}',
    previewKind: 'message',
    previewSample: discordMessage('⚔️ **Tuncay**  vs  **Mavi Sis**'),
  });
  pushEntry(out, {
    id: 'duel.start',
    category: 'Düello',
    label: 'Savaş başlıyor (buton sonrası)',
    sourceFile: 'src/commands/owl-pvp.ts',
    trigger: 'Düello kabul edilince geçici mesaj',
    current: '⚔️ **Savaş başlıyor...**',
    previewKind: 'message',
    previewSample: discordMessage('⚔️ **Savaş başlıyor...**'),
  });
  pushEntry(out, {
    id: 'duel.result',
    category: 'Düello',
    label: 'Kazanan duyurusu',
    sourceFile: 'src/utils/duel-ux.ts',
    trigger: 'Düello bitti — son mesaj',
    current: '🏆 **{winner}** düelloyu kazandı.',
    previewKind: 'message',
    previewSample: discordMessage('🏆 **Tuncay** düelloyu kazandı.'),
  });

  // ── Blackjack solo ────────────────────────────────────────────────────────
  pushEntry(out, {
    id: 'bj.resume.note',
    category: 'Blackjack',
    label: 'Devam eden el — alt not',
    sourceFile: 'src/commands/bj.ts',
    trigger: 'Yarım kalmış BJ oturumu açılınca',
    current: '> 🃏 **Gölge 21**',
    previewKind: 'message',
    previewSample: discordMessage('🃏 <@oyuncu>\n🃏 Blackjack · …\n> 🃏 **Gölge 21**'),
    tags: ['slop'],
  });
  pushEntry(out, {
    id: 'bj.play.note',
    category: 'Blackjack',
    label: 'Yeni el — alt not',
    sourceFile: 'src/commands/bj.ts',
    trigger: 'BJ başlangıç ekranı',
    current: '(not yok — ÇEK / DUR butonları)',
    previewKind: 'message',
    previewSample: discordMessage('🃏 <@oyuncu>\n🃏 Blackjack · …\nKrupiye [9]\n…'),
    tags: ['slop'],
  });
  pushEntry(out, {
    id: 'bj.natural21.note',
    category: 'Blackjack',
    label: '21 olunca krupiyer notu',
    sourceFile: 'src/commands/bj.ts',
    trigger: 'Oyuncu 21 olunca krupiyer turuna geçiş',
    current: '> ✨ *21! Krupiyer oynuyor...*',
    previewKind: 'message',
    previewSample: discordMessage('> ✨ *21! Krupiyer oynuyor...*'),
    tags: ['slop'],
  });

  // ── Hunt / flow ───────────────────────────────────────────────────────────
  pushEntry(out, {
    id: 'hunt.loading',
    category: 'Av',
    label: 'Av loading mesajı',
    sourceFile: 'src/middleware/flow-intent.ts → buildHuntProgressMessage',
    trigger: 'İlk avlarda sonuç gelmeden önce (5. avdan sonra kapalı)',
    current: '(kapalı — null)',
    previewKind: 'message',
    previewSample: discordMessage('(şu an gönderilmiyor)'),
    tags: ['editable-hook'],
  });
  pushEntry(out, {
    id: 'flow.cooldown.hunt',
    category: 'Akış · Cooldown ipucu',
    label: 'Hunt cooldown eğitimi',
    sourceFile: 'src/middleware/flow-intent.ts',
    trigger: 'Hunt cooldown sırasında tekrar komut',
    current: '💡 Avlar arasında biraz baykuşunun dinlenmesi gerekebilir..',
    previewKind: 'message',
    previewSample: discordMessage('💡 Avlar arasında biraz baykuşunun dinlenmesi gerekebilir..'),
  });
  pushEntry(out, {
    id: 'flow.lost.footer',
    category: 'Akış',
    label: 'Kaybolmuş oyuncu footer',
    sourceFile: 'src/middleware/flow-intent.ts',
    trigger: 'Belirli akışlarda alt ipucu',
    current: '🦉 Yeniysen **"Owl Hunt"** komudu ile avlan!',
    previewKind: 'message',
    previewSample: discordMessage('🦉 Yeniysen **"Owl Hunt"** komudu ile avlan!'),
  });

  // ── Sim PvP flavor ────────────────────────────────────────────────────────
  pushStringPool(out, {
    category: 'Sim PvP',
    sourceFile: 'src/config.ts',
    poolId: 'sim.pvp.flavor',
    poolLabel: 'Gerçek oyuncu baykuşu flavor',
    trigger: 'w duel sim — gerçek oyuncu karşılaşınca',
    values: [...SIM_PVP_PLAYER_OWL_FLAVOR],
  });

  // ── Moon tier flavor ──────────────────────────────────────────────────────
  for (const tier of OWL_MOON_TIERS) {
    if (!tier.flavor) continue;
    pushEntry(out, {
      id: `moon.tier.${tier.moonTier}.flavor`,
      category: 'Baykuş · Moon tier',
      label: `${tier.label} flavor`,
      sourceFile: 'src/config/owl-moon-tier.ts + owl-moon-ux.ts',
      trigger: 'w upgrade — ay evrimi mesajında flavor satırı',
      current: tier.flavor,
      previewKind: 'message',
      previewSample: discordMessage(tier.flavor),
    });
  }

  // ── Liderboard rol duyuruları ───────────────────────────────────────────
  const roleFlavors = [
    { id: 'power', headline: '👑İMPARATOR TAHTI EL DEĞİŞTİ', tagline: 'Taç yeni sahibine geçti..' },
    { id: 'pvp', headline: '⚔️ ARENA TAHTI EL DEĞİŞTİRDİ', tagline: 'Arenanın yeni sahibi artık başka bir avcının.' },
    { id: 'wealth', headline: '💰 ALTIN BARONU DEĞİŞTİ', tagline: 'Servet sıralaması değşti..' },
  ];
  for (const r of roleFlavors) {
    pushEntry(out, {
      id: `roles.steal.${r.id}.headline`,
      category: 'Liderboard · Rol',
      label: `${r.id} — başlık`,
      sourceFile: 'src/systems/roles.ts',
      trigger: 'Liderboard birincisi değişince kanal duyurusu',
      current: r.headline,
      previewKind: 'embed',
      previewSample: discordEmbed(r.headline, `**Tuncay** tahtı devraldı.\n\n> *${r.tagline}*`),
    });
    pushEntry(out, {
      id: `roles.steal.${r.id}.tagline`,
      category: 'Liderboard · Rol',
      label: `${r.id} — tagline`,
      sourceFile: 'src/systems/roles.ts',
      trigger: 'Embed alıntı satırı',
      current: r.tagline,
      previewKind: 'embed',
      previewSample: discordEmbed(r.headline, `> *${r.tagline}*`),
      tags: ['slop', 'fragment'],
    });
  }

  // ── Ödül headline şablonları ────────────────────────────────────────────
  const headlines = [
    { id: 'daily', current: '📅 {name}, günlük ödülünü aldı.\nSende almak ister misin? "**Owl daily**"', file: 'src/commands/owl-daily.ts', trigger: 'w daily' },
    { id: 'sell', current: '💰 {name}, avlarını sattı.', file: 'src/commands/owl-misc.ts', trigger: 'w sell all' },
    { id: 'quest', current: '🎁 Görev ödülü alındı.', file: 'src/commands/owl-quests.ts', trigger: 'Görev claim' },
  ];
  for (const h of headlines) {
    pushEntry(out, {
      id: `reward.headline.${h.id}`,
      category: 'Ödül · Headline',
      label: h.id,
      sourceFile: h.file,
      trigger: h.trigger,
      current: h.current,
      previewKind: 'message',
      previewSample: discordMessage(h.current.replace('{name}', 'Tuncay')),
    });
  }

  // ── PvP turn flavor (text duel — eski animasyon) ─────────────────────────
  for (const [kind, lines] of [
    ['hit', ['💥 vurdu!', '⚔️ saldırdı!', '🦅 atıldı!', '💢 çarptı!']],
    ['crit', ['🔥 **KRİTİK!!**', '⚡ **GÜÇLÜ DARBE!!**', '💥 **MÜKEMMEL!!**']],
    ['exec', ['💀 **SON DARBE!!**', '☠️ **BİTİRDİ!!**', '🩸 **EXECUTE!!**']],
    ['dodge', ['🛡️ zayıf darbe...', '💨 kaçındı!', '🌀 savuşturdu!']],
  ] as const) {
    lines.forEach((line, index) => {
      pushEntry(out, {
        id: `pvp.turn.${kind}.${index}`,
        category: 'Düello · Tur flavor',
        label: `${kind} #${index + 1}`,
        sourceFile: 'src/utils/pvp-ux.ts',
        trigger: 'Metin tabanlı düello tur satırı (PNG kart dışı)',
        current: line,
        previewKind: 'message',
        previewSample: discordMessage(`> **Tuncay** ${line} **-42** HP`),
        tags: ['slop', 'pool'],
      });
    });
  }

  // ── Tame havuzları ────────────────────────────────────────────────────────
  pushPersonalityPool(out, {
    category: 'Tame · Giriş',
    sourceFile: 'src/utils/tame-texts.ts',
    poolId: 'tame.intro',
    poolLabel: 'Intro',
    trigger: 'Tame başlangıç embed',
    pool: INTRO_TEXTS,
  });
  pushReactionPool(out);
  pushPersonalityPool(out, {
    category: 'Tame · Başarı',
    sourceFile: 'src/utils/tame-texts.ts',
    poolId: 'tame.success',
    poolLabel: 'Success',
    trigger: 'Tame başarılı',
    pool: SUCCESS_TEXTS,
  });
  pushPersonalityPool(out, {
    category: 'Tame · Başarısız',
    sourceFile: 'src/utils/tame-texts.ts',
    poolId: 'tame.fail',
    poolLabel: 'Fail',
    trigger: 'Tame başarısız',
    pool: FAIL_TEXTS,
  });
  pushPersonalityPool(out, {
    category: 'Tame · Kritik başarı',
    sourceFile: 'src/utils/tame-texts.ts',
    poolId: 'tame.crit-success',
    poolLabel: 'Crit success',
    trigger: 'Kritik tame başarı',
    pool: CRITICAL_SUCCESS_TEXTS,
  });
  pushPersonalityPool(out, {
    category: 'Tame · Kritik fail',
    sourceFile: 'src/utils/tame-texts.ts',
    poolId: 'tame.crit-fail',
    poolLabel: 'Crit fail',
    trigger: 'Kritik tame fail',
    pool: CRITICAL_FAIL_TEXTS,
  });
  pushPersonalityPool(out, {
    category: 'Tame · İpucu',
    sourceFile: 'src/utils/tame-texts.ts',
    poolId: 'tame.hint',
    poolLabel: 'Hint',
    trigger: 'Embed footer ipucu',
    pool: HINT_TEXTS,
    previewWrap: (t) => discordEmbed('🦉 Evcilleştirme', `(gövde…)\n\n— ${t}`),
  });
  pushEndingPool(out);

  appendExtendedCopyCatalog(out);

  return out;
}

/** Panelde gösterilecek gerçek Discord çıktıları (havuz parçaları / şablon kancaları hariç). */
export function isUserFacingOutput(entry: CopyCatalogEntry): boolean {
  const tags = entry.tags ?? [];
  if (tags.includes('pool')) return false;
  if (tags.includes('fragment')) return false;
  if (tags.includes('duplicate')) return false;
  if (tags.includes('editable-hook')) return false;

  const p = entry.previewPayload;
  const hasContent = Boolean(p.content?.trim());
  const hasEmbed = Boolean(p.embeds?.some((e) => e.title?.trim() || e.description?.trim()));
  const hasAttachment = Boolean(p.attachments?.length);
  if (!hasContent && !hasEmbed && !hasAttachment) return false;

  const cur = entry.current.trim();
  if (cur.startsWith('(') && /kapalı|boş|gönderilmiyor/i.test(cur)) return false;

  return true;
}

export function filterUserFacingOutputs(entries: CopyCatalogEntry[]): CopyCatalogEntry[] {
  return entries.filter(isUserFacingOutput);
}

export function getCopyCatalogMeta(entries: CopyCatalogEntry[]): {
  total: number;
  categories: string[];
  slopCount: number;
  outputCount: number;
} {
  const categories = [...new Set(entries.map((e) => e.category))].sort();
  const slopCount = entries.filter((e) => e.tags?.includes('slop')).length;
  const outputCount = filterUserFacingOutputs(entries).length;
  return { total: entries.length, categories, slopCount, outputCount };
}
