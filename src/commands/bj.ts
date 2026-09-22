import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type Message,
} from 'discord.js';
import {
  beginSoloBlackjackSession,
  settleSoloBlackjack,
} from '../systems/gamble/solo-blackjack';
import { loadSoloBjSession, saveSoloBjSession, refreshSoloBjSessionTtl, type SoloBjSession } from '../systems/gamble/session-bj';
import { formatCoinLabel, COIN_EMOJI } from '../config/ui-emojis';
import { type BlackjackOutcome } from '../utils/result-ux';
import { validateGambleBet } from '../systems/gamble/validate-bet';
import type { CommandContext } from '../types';
import { armCooldown, peekCooldown } from '../middleware/cooldown-manager';
import { GAMBLE_BJ_COOLDOWN_MS } from '../config';
import { buildCooldownMessage } from '../utils/command-error';
import {
  replyCooldownIfAllowed,
  replyWithSuppression,
  SuppressionKeys,
} from '../utils/guarded-discord';

// ─── Kart sistemi ─────────────────────────────────────────────────────────────
const SUITS = ['♠', '♥', '♦', '♣'] as const;
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

const SUIT_EMOJI: Record<string, string> = {
  '♠': '♠️', '♥': '♥️', '♦': '♦️', '♣': '♣️',
};

interface Card {
  rank: string;
  suit: string;
  value: number;
}

function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const value = rank === 'A' ? 11 : ['J', 'Q', 'K'].includes(rank) ? 10 : parseInt(rank);
      deck.push({ rank, suit, value });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

function handValue(hand: Card[]): number {
  let total = hand.reduce((s, c) => s + c.value, 0);
  let aces = hand.filter((c) => c.rank === 'A').length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function isBlackjack(hand: Card[]): boolean {
  return hand.length === 2 && handValue(hand) === 21;
}

function formatCard(card: Card): string {
  return `${card.rank}${SUIT_EMOJI[card.suit] ?? card.suit}`;
}

function renderHand(hand: Card[], hideFirst = false): string {
  if (hideFirst && hand.length >= 2) {
    return ['🂠', ...hand.slice(1).map(formatCard)].join(' ');
  }
  return hand.map(formatCard).join(' ');
}

function formatTotal(hand: Card[], bustLabel = true): string {
  const v = handValue(hand);
  if (bustLabel && v > 21) return 'BUST 💀';
  if (isBlackjack(hand)) return '21 🎉';
  return String(v);
}

/** El sonu — kompakt: Kazandın · +90 · toplam Coin */
function buildResultBanner(type: BlackjackOutcome, delta: number, finalCoins: number): string {
  const label = ({
    blackjack: 'Blackjack',
    win: 'Kazandın',
    dealer_bust: 'Kazandın',
    lose: 'Kaybettin',
    bust: 'Bust',
    tie: 'Berabere',
  } as const)[type];
  const signed = `${delta >= 0 ? '+' : ''}${Math.trunc(delta).toLocaleString('tr-TR')}`;
  return `${label} · ${COIN_EMOJI} ${signed} · toplam ${formatCoinLabel(finalCoins)}`;
}

// ─── Buton satırı ─────────────────────────────────────────────────────────────
function buildRow(disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('bj_hit')
      .setEmoji('👊')
      .setLabel('ÇEK')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('bj_stand')
      .setEmoji('🛑')
      .setLabel('DUR')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

// ─── Oyun ekranı ──────────────────────────────────────────────────────────────
interface GameScreenOpts {
  username: string;
  userId?: string;
  bet: number;
  playerHand: Card[];
  dealerHand: Card[];
  hideDealer: boolean;
  phase: 'playing' | 'dealer' | 'ended';
  note?: string;
}

function buildScreen(opts: GameScreenOpts): string {
  const { username, userId, bet, playerHand, dealerHand, hideDealer, note } = opts;

  const dealerTotal = hideDealer
    ? (dealerHand.length > 1 ? String(handValue(dealerHand.slice(1))) : '?')
    : formatTotal(dealerHand);
  const playerTotal = formatTotal(playerHand);

  const header = userId ? `🃏 <@${userId}>` : `🃏 **${username}**`;

  const lines = [
    header,
    `🃏 Blackjack · ${formatCoinLabel(bet)}`,
    '',
    `Krupiye [${dealerTotal}]`,
    renderHand(dealerHand, hideDealer),
    '',
    `${username} [${playerTotal}]`,
    renderHand(playerHand),
  ];

  if (note) {
    lines.push('', note);
  }

  return lines.join('\n');
}

/** Copy Editor — solo BJ oyun ekranı önizlemesi */
export function buildSoloBjPreviewScreen(username = 'Tuncay', bet = 100): string {
  return buildScreen({
    username,
    userId: 'preview-player',
    bet,
    playerHand: [
      { rank: 'K', suit: '♠', value: 10 },
      { rank: '9', suit: '♥', value: 9 },
    ],
    dealerHand: [
      { rank: 'A', suit: '♦', value: 11 },
      { rank: '7', suit: '♣', value: 7 },
    ],
    hideDealer: true,
    phase: 'playing',
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Krupiyer turu (paylaşılan logic) ────────────────────────────────────────
async function runDealerTurn(opts: {
  edit: (content: string, disabled?: boolean) => Promise<void>;
  username: string;
  bet: number;
  playerHand: Card[];
  dealerHand: Card[];
  deck: Card[];
  ctx: CommandContext;
  userId: string;
}): Promise<void> {
  const { edit, username, bet, playerHand, dealerHand, deck, ctx, userId } = opts;

  // Krupiyer 17'ye kadar çeker
  while (handValue(dealerHand) < 17) {
    dealerHand.push(deck.pop()!);
    await edit(
      buildScreen({
        username, userId, bet, playerHand, dealerHand,
        hideDealer: false, phase: 'dealer',
      }),
      true,
    );
    await sleep(700);
  }

  const pv = handValue(playerHand);
  const dv = handValue(dealerHand);

  // Sonuç
  let outcomeType: BlackjackOutcome;
  let settleOutcome: 'win' | 'lose' | 'tie';

  if (dv > 21)       { outcomeType = 'dealer_bust'; settleOutcome = 'win'; }
  else if (pv > dv)  { outcomeType = 'win';         settleOutcome = 'win'; }
  else if (pv < dv)  { outcomeType = 'lose';        settleOutcome = 'lose'; }
  else               { outcomeType = 'tie';         settleOutcome = 'tie'; }

  const result = await settleSoloBlackjack(ctx.prisma, ctx.redis, userId, settleOutcome);

  await edit(
    buildScreen({
      username, userId, bet, playerHand, dealerHand,
      hideDealer: false, phase: 'ended',
      note: buildResultBanner(outcomeType, result.deltaCoins, result.finalCoins),
    }),
    true,
  );
}

// ─── Text komutu handler (owl bj) ────────────────────────────────────────────
async function resumeSoloBj(message: Message, ctx: CommandContext, session: SoloBjSession): Promise<void> {
  const userId = message.author.id;
  const username = session.username;
  const { bet, playerHand, dealerHand, deck } = session;
  await refreshSoloBjSessionTtl(ctx.redis, userId);

  const sent = await message.reply({
    content: buildScreen({
      username,
      userId,
      bet,
      playerHand,
      dealerHand,
      hideDealer: true,
      phase: 'playing',
      note: `> 🃏 **Gölge 21**`,
    }),
    components: [buildRow()],
  });

  const edit = async (content: string, disabled = false): Promise<void> => {
    await sent.edit({ content, components: [buildRow(disabled)] }).catch(() => null);
    await saveSoloBjSession(ctx.redis, { ...session, playerHand, dealerHand, deck });
  };

  const collector = sent.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
    filter: (i) => i.user.id === userId,
  });

  collector.on('collect', async (i) => {
    if (i.customId === 'bj_hit') {
      playerHand.push(deck.pop()!);
      const pv = handValue(playerHand);
      if (pv > 21) {
        collector.stop('bust');
        const result = await settleSoloBlackjack(ctx.prisma, ctx.redis, userId, 'lose');
        await i.update({
          content: buildScreen({
            username, userId, bet, playerHand, dealerHand,
            hideDealer: false, phase: 'ended',
            note: buildResultBanner('bust', result.deltaCoins, result.finalCoins ?? 0),
          }),
          components: [buildRow(true)],
        });
        return;
      }
      if (pv === 21) {
        collector.stop('stand');
        await i.update({
          content: buildScreen({
            username, userId, bet, playerHand, dealerHand,
            hideDealer: true, phase: 'dealer',
            note: `> ✨ *21! Krupiyer oynuyor...*`,
          }),
          components: [buildRow(true)],
        });
        await runDealerTurn({ edit, username, bet, playerHand, dealerHand, deck, ctx, userId });
        return;
      }
      await i.update({
        content: buildScreen({
          username, userId, bet, playerHand, dealerHand,
          hideDealer: true, phase: 'playing',
        }),
        components: [buildRow()],
      });
    } else if (i.customId === 'bj_stand') {
      collector.stop('stand');
      await i.update({
        content: buildScreen({
          username, userId, bet, playerHand, dealerHand,
          hideDealer: true, phase: 'dealer',
        }),
        components: [buildRow(true)],
      });
      await runDealerTurn({ edit, username, bet, playerHand, dealerHand, deck, ctx, userId });
    }
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'time') {
      await runDealerTurn({ edit, username, bet, playerHand, dealerHand, deck, ctx, userId }).catch(() => null);
    }
  });
}

export async function handleBjTextCommand(
  message: Message,
  bet: number | undefined,
  ctx: CommandContext,
): Promise<void> {
  const userId      = message.author.id;
  const cooldownKey = `cooldown:bj:${userId}`;
  const cooldown = await peekCooldown(ctx.redis, cooldownKey);
  if (cooldown.active) {
    await replyCooldownIfAllowed(
      message,
      cooldownKey,
      buildCooldownMessage(
        cooldown.remainingMs,
        'blackjack',
        message.member?.displayName ?? message.author.displayName ?? message.author.username,
      ),
    );
    return;
  }

  const username = message.member?.displayName ?? message.author.username;

  const existing = await loadSoloBjSession(ctx.redis, userId);
  if (existing) {
    await resumeSoloBj(message, ctx, existing);
    return;
  }

  if (bet === undefined) {
    await replyWithSuppression(
      message,
      '❌ Kullanım: `owl bj <miktar|all>` — aktif elin varsa sadece `owl bj` yaz.',
      SuppressionKeys.usage('bj', 'solo'),
    );
    return;
  }

  const player = await ctx.prisma.player.findUnique({ where: { id: userId } });
  const check = validateGambleBet(bet, { playerCoins: player?.coins ?? 0 });
  if (!check.ok) {
    await replyWithSuppression(
      message,
      `❌ ${check.message ?? 'Bahis geçersiz.'}`,
      SuppressionKeys.economy('bj-insufficient'),
    );
    return;
  }

  const deck = makeDeck();
  const playerHand: Card[] = [deck.pop()!, deck.pop()!];
  const dealerHand: Card[] = [deck.pop()!, deck.pop()!];

  await beginSoloBlackjackSession(ctx.prisma, ctx.redis, {
    userId,
    bet,
    username,
    playerHand,
    dealerHand,
    deck,
  });

  // Anında Blackjack
  if (isBlackjack(playerHand)) {
    const result = await settleSoloBlackjack(ctx.prisma, ctx.redis, userId, 'blackjack');
    await armCooldown(ctx.redis, cooldownKey, GAMBLE_BJ_COOLDOWN_MS);
    await message.reply(
      buildScreen({
        username, userId, bet, playerHand, dealerHand,
        hideDealer: false, phase: 'ended',
        note: buildResultBanner('blackjack', result.deltaCoins, result.finalCoins),
      }),
    );
    return;
  }

  await armCooldown(ctx.redis, cooldownKey, GAMBLE_BJ_COOLDOWN_MS);
  const sent = await message.reply({
    content: buildScreen({
      username, userId, bet, playerHand, dealerHand,
      hideDealer: true, phase: 'playing',
    }),
    components: [buildRow()],
  });

  const edit = async (content: string, disabled = false): Promise<void> => {
    await sent.edit({ content, components: [buildRow(disabled)] }).catch(() => null);
  };

  const collector = sent.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
    filter: (i) => i.user.id === userId,
  });

  collector.on('collect', async (i) => {
    if (i.customId === 'bj_hit') {
      playerHand.push(deck.pop()!);
      const pv = handValue(playerHand);

      if (pv > 21) {
        collector.stop('bust');
        const result = await settleSoloBlackjack(ctx.prisma, ctx.redis, userId, 'lose');
        await i.update({
          content: buildScreen({
            username, userId, bet, playerHand, dealerHand,
            hideDealer: false, phase: 'ended',
            note: buildResultBanner('bust', result.deltaCoins, result.finalCoins),
          }),
          components: [buildRow(true)],
        });
        return;
      }

      if (pv === 21) {
        collector.stop('stand');
        await i.update({
          content: buildScreen({
            username, userId, bet, playerHand, dealerHand,
            hideDealer: true, phase: 'dealer',
            note: `> ✨ *21! Krupiyer oynuyor...*`,
          }),
          components: [buildRow(true)],
        });
        await runDealerTurn({ edit, username, bet, playerHand, dealerHand, deck, ctx, userId });
        return;
      }

      await i.update({
        content: buildScreen({
          username, userId, bet, playerHand, dealerHand,
          hideDealer: true, phase: 'playing',
        }),
        components: [buildRow()],
      });

    } else if (i.customId === 'bj_stand') {
      collector.stop('stand');
      await i.update({
        content: buildScreen({
          username, userId, bet, playerHand, dealerHand,
          hideDealer: true, phase: 'dealer',
        }),
        components: [buildRow(true)],
      });
      await runDealerTurn({ edit, username, bet, playerHand, dealerHand, deck, ctx, userId });
    }
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'time') {
      await runDealerTurn({ edit, username, bet, playerHand, dealerHand, deck, ctx, userId }).catch(() => null);
    }
  });
}
