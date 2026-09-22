/**
 * Copy Editor — ek bot çıktıları (av, cooldown, tame UI, ödüller…).
 */
import type { CopyCatalogEntry } from './copy-catalog';
import type { DiscordPreviewPayload } from './discord-preview-types';
import {
  embedFromBuilder,
  msgPayload,
  sampleCooldown,
  sampleDailyReward,
  sampleDuelbetInvite,
  sampleDuelResult,
  sampleDuelVsWithCard,
  sampleEncounterFightLose,
  sampleGenericError,
  sampleHuntResult,
  sampleInflightBusy,
  sampleMoonEvolution,
  samplePvpBJGame,
  samplePvpBJResult,
  sampleSoloBjGame,
  sampleSpamMute,
  sampleTameEncounter,
  sampleTameFail,
  sampleTameSuccess,
  SAMPLE_OPPONENT,
  SAMPLE_PLAYER,
} from './copy-preview-samples';
import { buildEncounterEmbed, buildEncounterFightMessage } from '../utils/encounter-ux';
import { buildSoloBjPreviewScreen } from '../commands/bj';
import { buildTameActionRow, buildTameFinalRow } from '../utils/tame-ux';

function push(
  out: CopyCatalogEntry[],
  partial: Omit<CopyCatalogEntry, 'previewSample'> & { previewSample?: string; previewPayload: DiscordPreviewPayload },
): void {
  const body = partial.previewPayload.content
    ?? partial.previewPayload.embeds?.[0]?.description
    ?? partial.current;
  out.push({
    ...partial,
    previewSample: partial.previewSample ?? body,
  });
}

function buttonsFromTame(): DiscordPreviewPayload['components'] {
  const state = {
    encounterId: 'preview',
    playerId: '0',
    owlSpecies: 'Gümüş Yarık',
    owlTier: 3,
    owlQuality: 'Nadir',
    personality: 'curious' as const,
    aggression: 40,
    awareness: 55,
    patience: 60,
    greed: 30,
    personalityLabel: 'Meraklı',
    personalityEmoji: '🔍',
    progress: 55,
    escapeRisk: 18,
    turn: 3,
    maxTurns: 5,
    usedLines: [],
    playerGoz: 8,
    playerKulak: 7,
    baseChance: 0.35,
  };
  const row1 = buildTameActionRow('preview', state).toJSON().components.map((c) => ({
    label: ('label' in c ? c.label : '?') ?? '?',
    style: 'secondary' as const,
  }));
  const row2 = buildTameFinalRow('preview', state).toJSON().components.map((c) => ({
    label: ('label' in c ? c.label : '?') ?? '?',
    style: 'success' as const,
  }));
  return [row1, row2];
}

export function appendExtendedCopyCatalog(out: CopyCatalogEntry[]): void {
  // ── Av ────────────────────────────────────────────────────────────────────
  push(out, {
    id: 'hunt.result.final',
    category: 'Av',
    label: 'Av sonucu',
    sourceFile: 'src/utils/hunt-ux.ts → buildFinalMessage',
    trigger: 'w hunt tamamlanınca tek mesaj',
    current: '🌙 {name}, avdan döndü. …',
    previewKind: 'message',
    previewPayload: sampleHuntResult(),
  });

  // ── Cooldown / hata ───────────────────────────────────────────────────────
  for (const [action, label] of [
    ['hunt', 'Av'],
    ['duel', 'Düello'],
    ['slot', 'Slot'],
    ['blackjack', 'Blackjack'],
    ['coinflip', 'Coinflip'],
    ['pvp_gamble', 'PvP Kumar'],
    ['upgrade', 'Upgrade'],
    ['transfer', 'Transfer'],
  ] as const) {
    push(out, {
      id: `system.cooldown.${action}`,
      category: 'Sistem · Cooldown',
      label,
      sourceFile: 'src/utils/command-error.ts → buildCooldownMessage',
      trigger: `\`${action}\` cooldown aktifken`,
      current: '⏱️ | **{name}**, {cooldown gövdesi} {süre} sonra … :<',
      previewKind: 'message',
      previewPayload: sampleCooldown(action),
      tags: ['system'],
    });
  }

  push(out, {
    id: 'system.inflight.busy',
    category: 'Sistem',
    label: 'Komut hâlâ işleniyor',
    sourceFile: 'src/utils/command-error.ts → buildInflightBusyMessage',
    trigger: 'Aynı komut tekrar (coinflip/slot spin devam ederken)',
    current: '⏱️ | **{name}**, bu komut hâlâ çalışıyor biraz bekler misin :<',
    previewKind: 'message',
    previewPayload: sampleInflightBusy(),
    tags: ['system'],
  });

  push(out, {
    id: 'system.spam.mute',
    category: 'Sistem',
    label: 'Spam susturma',
    sourceFile: 'src/utils/command-error.ts → buildSpamMuteMessage',
    trigger: 'Spam algılandığında',
    current: '⏱️ | **{name}**, lütfen yavaşla Çok hızlısın :<  **N saniye** …',
    previewKind: 'message',
    previewPayload: sampleSpamMute(),
    tags: ['system'],
  });

  push(out, {
    id: 'system.error.generic',
    category: 'Sistem',
    label: 'Genel hata',
    sourceFile: 'src/utils/command-error.ts',
    trigger: 'Beklenmeyen sunucu hatası (kullanıcıya güvenli mesaj)',
    current: '@{name} Şuan bazı **problemlerim** var :< biraz bekler misin?',
    previewKind: 'message',
    previewPayload: sampleGenericError(),
    tags: ['system'],
  });

  // ── Tame UI ───────────────────────────────────────────────────────────────
  const tamePayload = sampleTameEncounter();
  tamePayload.components = buttonsFromTame();
  push(out, {
    id: 'tame.ui.encounter',
    category: 'Tame · UI',
    label: 'Evcilleştirme embed + butonlar',
    sourceFile: 'src/utils/tame-ux.ts → buildTameEncounterEmbed',
    trigger: 'Yabani baykuş tame akışı — her tur',
    current: '(embed + aksiyon butonları)',
    previewKind: 'embed',
    previewPayload: tamePayload,
    tags: ['ui'],
  });

  push(out, {
    id: 'tame.result.success',
    category: 'Tame · UI',
    label: 'Başarılı tame sonucu',
    sourceFile: 'src/utils/tame-ux.ts → buildTameResultMessage',
    trigger: 'Tame başarılı — düz metin',
    current: '{owl} evcilleştirildi.',
    previewKind: 'message',
    previewPayload: sampleTameSuccess(),
  });

  push(out, {
    id: 'tame.result.fail',
    category: 'Tame · UI',
    label: 'Kaçış sonucu',
    sourceFile: 'src/utils/tame-ux.ts → buildTameResultMessage',
    trigger: 'Tame başarısız',
    current: '💨 {species} kaçtı.',
    previewKind: 'message',
    previewPayload: sampleTameFail(),
  });

  // ── Encounter ─────────────────────────────────────────────────────────────
  const encounterEmbed = buildEncounterEmbed(
    {
      species: 'Bronz Kartalı',
      tier: 2,
      quality: 'Normal',
      statGaga: 8,
      statGoz: 6,
      statKulak: 7,
      statKanat: 9,
      statPence: 7,
      traits: [],
    },
    {
      species: SAMPLE_PLAYER,
      nickname: null,
      tier: 8,
      quality: 'Efsanevi',
      statGaga: 13,
      statGoz: 6,
      statKulak: 10,
      statKanat: 11,
      statPence: 10,
      hp: 88,
      hpMax: 100,
    },
    {
      coinMin: 20,
      coinMax: 45,
      xpMin: 30,
      xpMax: 55,
      materialMin: 0,
      materialMax: 1,
      buffChance: 0.08,
      lootboxChance: 0.02,
    },
    'w',
  );

  push(out, {
    id: 'encounter.ui.embed',
    category: 'Encounter · UI',
    label: 'Yabani karşılaşma embed',
    sourceFile: 'src/utils/encounter-ux.ts → buildEncounterEmbed',
    trigger: 'Av sırasında yabani baykuş — Savaş/Kaç',
    current: '(embed + butonlar)',
    previewKind: 'embed',
    previewPayload: {
      ...embedFromBuilder(encounterEmbed),
      components: [[
        { label: '⚔️ Savaş', style: 'danger' },
        { label: '🏃 Kaç', style: 'secondary' },
      ]],
    },
    tags: ['ui'],
  });

  push(out, {
    id: 'encounter.fight.result',
    category: 'Encounter · UI',
    label: 'Savaş sonucu — kazanç',
    sourceFile: 'src/utils/encounter-ux.ts → buildEncounterFightMessage',
    trigger: 'Encounter savaşı bitince (kazanç)',
    current: '🏆 {player} yabani baykuşu MAHVETTİ!!',
    previewKind: 'message',
    previewPayload: msgPayload(buildEncounterFightMessage({
      playerWon: true,
      rewardCoins: 42,
      rewardXP: 38,
      lootItems: [],
      enemyTier: 2,
      enemyQuality: 'Normal',
      enemySpecies: 'Bronz Kartalı',
      enemyLevel: 5,
      winChance: 0.72,
      playerLevel: 12,
      playerXp: 11060,
    }, SAMPLE_PLAYER)),
  });

  push(out, {
    id: 'encounter.fight.result.lose',
    category: 'Encounter · UI',
    label: 'Savaş sonucu — kayıp',
    sourceFile: 'src/utils/encounter-ux.ts → buildEncounterFightMessage',
    trigger: 'Encounter savaşı kaybedilince',
    current: '⚔️ {player} yabani baykuşa karşı savaşı kaybetti.',
    previewKind: 'message',
    previewPayload: sampleEncounterFightLose(),
  });

  // ── PvP Blackjack UI ──────────────────────────────────────────────────────
  push(out, {
    id: 'pvp.bj.game',
    category: 'PvP Kumar · Blackjack',
    label: 'Oyun ekranı (ÇEK / DUR)',
    sourceFile: 'src/commands/pvp.ts → buildPvpBJGameScreen',
    trigger: 'PvP BJ kabul edilince + her tur edit',
    current: '🃏 <@oyuncu> + Blackjack · bahis + eller',
    previewKind: 'composite',
    previewPayload: samplePvpBJGame(),
    tags: ['ui'],
  });

  push(out, {
    id: 'pvp.bj.result',
    category: 'PvP Kumar · Blackjack',
    label: 'El sonucu',
    sourceFile: 'src/commands/pvp.ts → buildPvpBJResultScreen',
    trigger: 'PvP BJ el bitince',
    current: '🃏 Blackjack · bahis + eller + kazandı · +coin · toplam',
    previewKind: 'message',
    previewPayload: samplePvpBJResult(),
    tags: ['ui'],
  });

  // ── Bahisli düello daveti ─────────────────────────────────────────────────
  push(out, {
    id: 'duelbet.invite',
    category: 'Bahisli Düello',
    label: 'Davet mesajı + butonlar',
    sourceFile: 'src/commands/duelbet.ts → buildDuelbetInviteContent',
    trigger: 'w duelbet @oyuncu [miktar]',
    current: '⚔️ @rakip bahisli düelloya davetlisin!',
    previewKind: 'composite',
    previewPayload: sampleDuelbetInvite(),
    tags: ['ui'],
  });

  // ── Ay evrimi (tam mesaj) ─────────────────────────────────────────────────
  push(out, {
    id: 'moon.evolution.message',
    category: 'Baykuş · Moon tier',
    label: 'Ay evrimi — tam Discord mesajı',
    sourceFile: 'src/utils/owl-moon-ux.ts → buildMoonEvolutionMessage',
    trigger: 'w upgrade — güç eşiği geçilince follow-up',
    current: '✦✦✦ AY EVRİMİ ✦✦✦',
    previewKind: 'message',
    previewPayload: sampleMoonEvolution(),
  });

  // ── Düello kart görseli ───────────────────────────────────────────────────
  push(out, {
    id: 'duel.card.vs',
    category: 'Düello · UI',
    label: 'VS + savaş kartı PNG',
    sourceFile: 'src/utils/battle-card.ts + pvp-ux.ts',
    trigger: 'Düello animasyonu — mesaj + ek görsel',
    current: '⚔️ **{challenger}**  vs  **{defender}** + PNG',
    previewKind: 'composite',
    previewPayload: sampleDuelVsWithCard(),
    tags: ['ui'],
  });

  push(out, {
    id: 'duel.result.full',
    category: 'Düello',
    label: 'Kazanan (kart sonrası)',
    sourceFile: 'src/utils/duel-ux.ts',
    trigger: 'Kart animasyonu bittikten sonra',
    current: '🏆 **{winner}** düelloyu kazandı.',
    previewKind: 'message',
    previewPayload: sampleDuelResult(),
    tags: ['duplicate'],
  });

  // ── Solo Blackjack ────────────────────────────────────────────────────────
  push(out, {
    id: 'bj.solo.game',
    category: 'Blackjack',
    label: 'Solo oyun ekranı (ÇEK / DUR)',
    sourceFile: 'src/commands/bj.ts → buildScreen',
    trigger: 'w bj [miktar] — el devam ederken',
    current: '🃏 <@oyuncu> + Blackjack · bahis + Krupiye/Oyuncu',
    previewKind: 'composite',
    previewPayload: sampleSoloBjGame(),
    tags: ['ui'],
  });

  // ── Ödül örneği ───────────────────────────────────────────────────────────
  push(out, {
    id: 'reward.daily.sample',
    category: 'Ödül · Headline',
    label: 'Günlük ödül (tam mesaj)',
    sourceFile: 'src/utils/result-ux.ts → buildRewardClaimMessage',
    trigger: 'w daily',
    current: '📅 {name}, günlük ödülünü aldı. + XP/Coin satırları',
    previewKind: 'message',
    previewPayload: sampleDailyReward(),
  });
}
