/**
 * Copy Editor — gerçek bot builder'larından örnek Discord çıktıları.
 */
import type { APIEmbed } from 'discord.js';
import type { EmbedBuilder } from 'discord.js';
import type { DiscordPreviewAttachment, DiscordPreviewPayload } from './discord-preview-types';
import {
  buildCoinFlipResultText,
  buildCoinFlipSpinText,
  buildPvpCoinFlipSpinText,
  buildPvpCoinFlipResultText,
} from '../utils/coinflip-ux';
import {
  buildPvpBJGameScreen,
  buildPvpBJResultScreen,
  buildPvpInviteEmbed,
  buildPvpSlotResultText,
} from '../commands/pvp';
import { buildDuelbetInviteContent } from '../commands/duelbet';
import { buildSoloBjPreviewScreen } from '../commands/bj';
import {
  buildSlotHelpMessage,
  buildSlotResultScreen,
  buildSlotSpinText,
  buildPvpSlotSpinText,
} from '../utils/slot-ux';
import { buildFinalMessage, type CompressedHunt } from '../utils/hunt-ux';
import {
  buildCooldownMessage,
  buildGenericUserError,
  buildInflightBusyMessage,
  buildSpamMuteMessage,
} from '../utils/command-error';
import { buildDuelResultMessage } from '../utils/duel-ux';
import { buildMoonEvolutionMessage } from '../utils/owl-moon-ux';
import { buildRewardClaimMessage } from '../utils/result-ux';
import { buildEncounterFightMessage } from '../utils/encounter-ux';
import { buildTameEncounterEmbed, buildTameResultMessage } from '../utils/tame-ux';
import type { TameSessionState } from '../systems/tame-session';
import { renderCoinEmoji } from '../config/ui-emojis';

export const SAMPLE_PLAYER = 'Tuncay';
export const SAMPLE_OPPONENT = 'Ali';

export function msgPayload(content: string): DiscordPreviewPayload {
  return { content };
}

export function embedPayload(
  embed: Partial<APIEmbed> | ReturnType<EmbedBuilder['toJSON']>,
): DiscordPreviewPayload {
  return {
    embeds: [{
      title: embed.title ?? undefined,
      description: embed.description ?? undefined,
      color: embed.color ?? undefined,
      footer: embed.footer ? { text: embed.footer.text ?? '' } : undefined,
      fields: embed.fields?.map((f) => ({
        name: f.name,
        value: f.value,
        inline: f.inline,
      })),
      image: embed.image?.url ? { url: embed.image.url } : undefined,
      thumbnail: embed.thumbnail?.url ? { url: embed.thumbnail.url } : undefined,
    }],
  };
}

export function embedFromBuilder(builder: EmbedBuilder): DiscordPreviewPayload {
  return embedPayload(builder.toJSON());
}

const SAMPLE_HUNT: CompressedHunt = {
  groups: [
    { name: 'Fare', emoji: '🐭', count: 2, sellPrice: 40, totalValue: 80, rare: false },
    { name: 'Kurbağa', emoji: '🐸', count: 1, sellPrice: 55, totalValue: 55, rare: false },
  ],
  totalXP: 67,
  totalValue: 135,
  hasCritical: false,
  hasRareCatch: false,
  levelUp: null,
  isEmpty: false,
  activeBuffs: [{ emoji: '⚡', chargeCur: 2, chargeMax: 3 }],
};

export function sampleHuntResult(): DiscordPreviewPayload {
  return msgPayload(buildFinalMessage(SAMPLE_PLAYER, SAMPLE_HUNT));
}

export function sampleCoinFlipSpin(): DiscordPreviewPayload {
  return msgPayload(buildCoinFlipSpinText(100, SAMPLE_PLAYER, 'heads'));
}

export function sampleCoinFlipResult(): DiscordPreviewPayload {
  return msgPayload(buildCoinFlipResultText({
    bet: 100,
    playerName: SAMPLE_PLAYER,
    win: true,
    resultFace: 'heads',
    deltaCoins: 130,
  }));
}

export function samplePvpCoinFlipSpin(): DiscordPreviewPayload {
  return msgPayload(buildPvpCoinFlipSpinText(SAMPLE_PLAYER, SAMPLE_OPPONENT, 500));
}

export function samplePvpCoinFlipResult(): DiscordPreviewPayload {
  return msgPayload(buildPvpCoinFlipResultText({
    challengerName: SAMPLE_PLAYER,
    defenderName: SAMPLE_OPPONENT,
    winnerName: SAMPLE_PLAYER,
    loserName: SAMPLE_OPPONENT,
    winnerGain: 950,
    loserLoss: 500,
    bet: 500,
    resultFace: 'tails',
  }));
}

export function sampleSlotSpin(): DiscordPreviewPayload {
  return msgPayload(buildSlotSpinText(SAMPLE_PLAYER, 100));
}

export function sampleSlotResult(): DiscordPreviewPayload {
  return msgPayload(buildSlotResultScreen({
    playerName: SAMPLE_PLAYER,
    bet: 100,
    finalSymbols: ['owl', 'owl', 'diamond'],
    win: true,
    deltaCoins: 280,
  }));
}

export function samplePvpSlotSpin(): DiscordPreviewPayload {
  return msgPayload(buildPvpSlotSpinText(SAMPLE_PLAYER, SAMPLE_OPPONENT, 500));
}

export function samplePvpSlotResult(): DiscordPreviewPayload {
  return msgPayload(buildPvpSlotResultText(
    {
      sessionId: 'preview',
      mode: 'slot',
      winnerId: 'challenger',
      loserId: 'defender',
      bet: 500,
      houseCut: 25,
      houseCutRate: 0.05,
      winnerGain: 475,
      loserLoss: 500,
      rebate: null,
      slot: {
        challengerSymbols: ['owl', 'owl', 'diamond'],
        defenderSymbols: ['coin', 'poop', 'poop'],
        comboBonus: false,
        comboXP: 0,
      },
    },
    SAMPLE_PLAYER,
    SAMPLE_OPPONENT,
    'challenger',
  ));
}

export function samplePvpInviteEmbed(mode: 'coinflip' | 'slot' | 'blackjack' = 'slot'): DiscordPreviewPayload {
  const embed = buildPvpInviteEmbed(mode, SAMPLE_PLAYER, SAMPLE_OPPONENT, 500, 0.05);
  return {
    ...embedFromBuilder(embed),
    components: [[
      { label: '✅ Kabul Et', style: 'success' },
      { label: '❌ Reddet', style: 'danger' },
      { label: '🚫 İptal', style: 'secondary' },
    ]],
  };
}

const MOCK_BJ_SESSION = {
  sessionId: 'preview',
  mode: 'blackjack' as const,
  challengerId: 'challenger',
  defenderId: 'defender',
  bet: 50_000,
  status: 'active' as const,
  createdAt: Date.now(),
  bj: {
    challengerHand: [
      { suit: '♠' as const, rank: 'K', value: 10 },
      { suit: '♥' as const, rank: '9', value: 9 },
    ],
    defenderHand: [
      { suit: '♦' as const, rank: 'A', value: 11 },
      { suit: '♣' as const, rank: '7', value: 7 },
    ],
    deck: [],
    currentTurn: 'challenger' as const,
    challengerStood: false,
    defenderStood: false,
  },
};

export function samplePvpBJGame(): DiscordPreviewPayload {
  return {
    content: buildPvpBJGameScreen(MOCK_BJ_SESSION, SAMPLE_PLAYER, SAMPLE_OPPONENT),
    components: [[
      { label: '👊 ÇEK', style: 'success' },
      { label: '🛑 DUR', style: 'danger' },
    ]],
  };
}

export function samplePvpBJResult(): DiscordPreviewPayload {
  return msgPayload(buildPvpBJResultScreen(
    {
      sessionId: 'preview',
      mode: 'blackjack',
      winnerId: 'challenger',
      loserId: 'defender',
      bet: 50_000,
      houseCut: 2500,
      houseCutRate: 0.05,
      winnerGain: 47_500,
      loserLoss: 50_000,
      rebate: null,
      blackjack: {
        outcome: 'challenger_wins',
        challengerHand: {
          cards: MOCK_BJ_SESSION.bj!.challengerHand,
          total: 19,
          isBust: false,
          isBlackjack: false,
          isSoft: false,
        },
        defenderHand: {
          cards: MOCK_BJ_SESSION.bj!.defenderHand,
          total: 18,
          isBust: false,
          isBlackjack: false,
          isSoft: true,
        },
      },
    },
    SAMPLE_PLAYER,
    SAMPLE_OPPONENT,
  ));
}

export function sampleDuelbetInvite(): DiscordPreviewPayload {
  return {
    content: buildDuelbetInviteContent('defender-id', SAMPLE_PLAYER, 1000, 8420, 3),
    components: [[
      { label: '✅ Kabul', style: 'success' },
      { label: '❌ Reddet', style: 'danger' },
      { label: '🚫 İptal', style: 'secondary' },
    ]],
  };
}

export function sampleMoonEvolution(): DiscordPreviewPayload {
  return msgPayload(buildMoonEvolutionMessage({
    owlId: 'preview',
    ownerId: 'user',
    speciesTier: 1,
    displayName: 'Gece Pençesi',
    oldMoonTier: 2,
    newMoonTier: 3,
    power: 190,
  }, 'w'));
}

export function sampleEncounterFightLose(): DiscordPreviewPayload {
  return msgPayload(buildEncounterFightMessage({
    playerWon: false,
    rewardCoins: 0,
    rewardXP: 0,
    lootItems: [],
    enemyTier: 4,
    enemyQuality: 'Nadir',
    enemySpecies: 'Gümüş Yarık',
    enemyLevel: 120,
    winChance: 22,
  }, SAMPLE_PLAYER));
}

export function sampleSlotHelp(): DiscordPreviewPayload {
  return msgPayload(buildSlotHelpMessage());
}

export function sampleDuelResult(): DiscordPreviewPayload {
  return msgPayload(buildDuelResultMessage({
    winnerName: SAMPLE_PLAYER,
    loserName: 'Ateş Rüyası',
    xpGained: 42,
    coinsGained: 100,
    level: 12,
    currentXp: 11060,
    totalTurns: 4,
  }));
}

export function sampleCooldown(action: Parameters<typeof buildCooldownMessage>[1]): DiscordPreviewPayload {
  return msgPayload(buildCooldownMessage(45_000, action, SAMPLE_PLAYER));
}

export function sampleInflightBusy(): DiscordPreviewPayload {
  return msgPayload(buildInflightBusyMessage(SAMPLE_PLAYER));
}

export function sampleSpamMute(): DiscordPreviewPayload {
  return msgPayload(buildSpamMuteMessage(SAMPLE_PLAYER, 15));
}

export function sampleGenericError(): DiscordPreviewPayload {
  return msgPayload(buildGenericUserError(SAMPLE_PLAYER));
}

export function sampleDailyReward(): DiscordPreviewPayload {
  return msgPayload(buildRewardClaimMessage({
    headline: `📅 ${SAMPLE_PLAYER}, günlük ödülünü aldı.\nSende almak ister misin? "**Owl daily**"`,
    xp: 50,
    coin: 200,
    level: 12,
    currentXp: 11060,
  }));
}

const SAMPLE_TAME_STATE: TameSessionState = {
  encounterId: 'preview',
  playerId: '0',
  owlSpecies: 'Gümüş Yarık',
  owlTier: 3,
  owlQuality: 'Nadir',
  personality: 'curious',
  aggression: 40,
  awareness: 55,
  patience: 60,
  greed: 30,
  personalityLabel: 'Meraklı',
  personalityEmoji: '🔍',
  progress: 42,
  escapeRisk: 18,
  turn: 2,
  maxTurns: 5,
  usedLines: [],
  playerGoz: 8,
  playerKulak: 7,
  baseChance: 0.35,
};

export function sampleTameEncounter(): DiscordPreviewPayload {
  return embedFromBuilder(buildTameEncounterEmbed(SAMPLE_TAME_STATE, {
    reaction: 'Gözlerini kırpıştırarak seni süzüyor.',
    continuation: 'Yavaşça yaklaşmayı dene.',
    hint: 'Sabırlı ol — acele kaçırır.',
  }));
}

export function sampleTameSuccess(): DiscordPreviewPayload {
  return msgPayload(buildTameResultMessage(SAMPLE_TAME_STATE, true));
}

export function sampleTameFail(): DiscordPreviewPayload {
  return msgPayload(buildTameResultMessage(SAMPLE_TAME_STATE, false));
}

/** Düello kartı PNG — panel attachment önizlemesi */
export function sampleDuelCardAttachment(): DiscordPreviewAttachment {
  return {
    url: '/api/admin/copy/preview/duel-card.png',
    alt: 'Düello kartı',
    filename: 'duel-card.png',
  };
}

export function sampleDuelVsWithCard(): DiscordPreviewPayload {
  return {
    content: `⚔️ **${SAMPLE_PLAYER}**  vs  **Ateş Rüyası**`,
    attachments: [sampleDuelCardAttachment()],
  };
}

export function sampleSoloBjGame(): DiscordPreviewPayload {
  return {
    content: buildSoloBjPreviewScreen(SAMPLE_PLAYER, 250),
    components: [[
      { label: '👊 ÇEK', style: 'success' },
      { label: '🛑 DUR', style: 'danger' },
    ]],
  };
}

export function sampleSignedCoinLine(): string {
  return `┃ ${renderCoinEmoji()} +130 Coin`;
}
