import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  SlashCommandBuilder,
  type Message,
} from 'discord.js';
import { settleBlackjack } from '../systems/gambling';
import type { CommandDefinition, CommandContext } from '../types';
import { failEmbed } from '../utils/embed';
import { getCooldownRemainingMs } from '../middleware/cooldown';
import { GAMBLE_BJ_COOLDOWN_MS } from '../config';
import { recordCoinsEarned } from '../systems/leaderboard';

const data = new SlashCommandBuilder()
  .setName('bj')
  .setDescription('🃏 Blackjack oyna!')
  .addIntegerOption((opt) =>
    opt.setName('bet').setDescription('Bahis miktarı').setRequired(true).setMinValue(1),
  );

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

// ─── Kart render ──────────────────────────────────────────────────────────────
function renderCard(card: Card): string {
  const s = SUIT_EMOJI[card.suit] ?? card.suit;
  return `\`${card.rank}${s}\``;
}

function renderHand(hand: Card[], hideFirst = false): string {
  if (hideFirst) return [`\`🂠\``, ...hand.slice(1).map(renderCard)].join(' ');
  return hand.map(renderCard).join(' ');
}

// ─── Sonuç banner ─────────────────────────────────────────────────────────────
type ResultType = 'blackjack' | 'win' | 'dealer_bust' | 'lose' | 'bust' | 'tie';

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

const RESULT_BANNERS: Record<ResultType, string[]> = {
  blackjack:   ['⚡ **BLACKJACK!** 21 anında!', '🌟 **BLACKJACK!** Mükemmel el!'],
  win:         ['🏆 **KAZANDIN!**', '✨ **ZAFER!** Dealer geçildi!', '🎯 **PERFECT!**'],
  dealer_bust: ['💥 **DEALER PATLADI!** Kazandın!', '🎊 **DEALER BUST!** Şanslısın!'],
  lose:        ['💀 **KAYBETTİN.**', '😔 **Bu sefer olmadı...**', '⚡ **Dealer seni geçti!**'],
  bust:        ['💣 **BUST!** 21\'i aştın!', '🔥 **PATLAMA!** Çok fazla çektin!'],
  tie:         ['🤝 **BERABERE.** Bahis iade edildi.'],
};

function buildResultBanner(type: ResultType, delta: number, finalCoins: number): string {
  const banner = pickRandom(RESULT_BANNERS[type]);
  const isWin = ['blackjack', 'win', 'dealer_bust'].includes(type);
  const isLose = ['lose', 'bust'].includes(type);

  const coinLine = isWin
    ? `> 💰 **+${delta} coin** kazandın! · Bakiye: **${finalCoins.toLocaleString('tr-TR')}** 💰`
    : isLose
    ? `> 💸 **-${Math.abs(delta)} coin** kaybettin. · Bakiye: **${finalCoins.toLocaleString('tr-TR')}** 💰`
    : `> 🔘 Bahis iade edildi. · Bakiye: **${finalCoins.toLocaleString('tr-TR')}** 💰`;

  return `${banner}\n${coinLine}`;
}

// ─── Flavour havuzları ────────────────────────────────────────────────────────
const HIT_TAUNTS = [
  '🎴 *kart alındı...* devam mı?',
  '🤞 bir tane daha...',
  '😬 *derin nefes*... iyi mi bu?',
  '🎲 şans seninle olsun...',
  '👀 oh? devam ediyoruz!',
  '🃏 kart geldi — panikle değil mantıkla',
];

const STAND_LINES = [
  '🛑 **Duruldu!** Krupiyer sırada...',
  '🧘 Sakin... krupiyer açılıyor.',
  '🎯 El tamam — krupiyer ne yapacak?',
];

const DEALER_LINES = [
  '🃏 Krupiyer çekiyor...',
  '👁️ Krupiyer devam ediyor...',
  '😤 Bir tane daha...',
];

const TIMEOUT_LINE = '⏰ **Süre doldu.** El iptal sayıldı.';

// ─── Buton satırı ─────────────────────────────────────────────────────────────
function buildRow(disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('bj_hit')
      .setEmoji('🃏')
      .setLabel('Hit')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('bj_stand')
      .setEmoji('🛑')
      .setLabel('Stand')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

// ─── Oyun ekranı ──────────────────────────────────────────────────────────────
interface GameScreenOpts {
  username: string;
  bet: number;
  playerHand: Card[];
  dealerHand: Card[];
  hideDealer: boolean;
  phase: 'playing' | 'dealer' | 'ended';
  note?: string;   // küçük alt satır (flavor / sonuç)
}

function buildScreen(opts: GameScreenOpts): string {
  const { username, bet, playerHand, dealerHand, hideDealer, phase, note } = opts;
  const pv = handValue(playerHand);
  const dv = handValue(dealerHand);

  const phaseTag: Record<typeof phase, string> = {
    playing: '🟢 Senin turun',
    dealer:  '🟡 Krupiyer oynuyor',
    ended:   '🔴 El bitti',
  };

  const sep = '─────────────────────';

  let s = `### 🃏 Blackjack\n`;
  s += `${sep}\n`;
  s += `**Bahis:** ${bet.toLocaleString('tr-TR')} 💰  ·  ${phaseTag[phase]}\n`;
  s += `${sep}\n\n`;

  // Krupiyer
  s += `🎩 **Krupiyer**`;
  if (!hideDealer) s += `  —  **${dv}**`;
  s += `\n${renderHand(dealerHand, hideDealer)}\n\n`;

  // Oyuncu
  const pvLabel = pv > 21 ? `**BUST! 💀**` : `**${pv}**`;
  s += `👤 **${username}**  —  ${pvLabel}\n`;
  s += `${renderHand(playerHand)}\n`;

  s += `\n${sep}`;
  if (note) s += `\n${note}`;

  return s;
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
        username, bet, playerHand, dealerHand,
        hideDealer: false, phase: 'dealer',
        note: `> ${pickRandom(DEALER_LINES)}`,
      }),
      true,
    );
    await sleep(700);
  }

  const pv = handValue(playerHand);
  const dv = handValue(dealerHand);

  // Sonuç
  let outcomeType: ResultType;
  let settleOutcome: 'win' | 'lose' | 'tie';

  if (dv > 21)       { outcomeType = 'dealer_bust'; settleOutcome = 'win'; }
  else if (pv > dv)  { outcomeType = 'win';         settleOutcome = 'win'; }
  else if (pv < dv)  { outcomeType = 'lose';        settleOutcome = 'lose'; }
  else               { outcomeType = 'tie';         settleOutcome = 'tie'; }

  const result = await settleBlackjack(ctx.prisma, userId, bet, settleOutcome);
  if (settleOutcome === 'win' && result.deltaCoins > 0) {
    recordCoinsEarned(ctx.prisma, userId, result.deltaCoins).catch(() => null);
  }

  await edit(
    buildScreen({
      username, bet, playerHand, dealerHand,
      hideDealer: false, phase: 'ended',
      note: buildResultBanner(outcomeType, result.deltaCoins, result.finalCoins),
    }),
    true,
  );
}

// ─── Slash execute ────────────────────────────────────────────────────────────
async function execute(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  try {
    const userId      = interaction.user.id;
    const cooldownKey = `cooldown:bj:${userId}`;
    const remaining   = await getCooldownRemainingMs(ctx.redis, cooldownKey, GAMBLE_BJ_COOLDOWN_MS);
    if (remaining > 0) {
      await interaction.reply({
        content: `⏰ Tekrar blackjack için **${Math.ceil(remaining / 1000)}s** beklemelisin.`,
        flags: 64,
      });
      return;
    }

    const bet = interaction.options.getInteger('bet', true);
    const username =
      interaction.member && 'displayName' in interaction.member
        ? (interaction.member as { displayName: string }).displayName
        : interaction.user.username;

    const player = await ctx.prisma.player.findUnique({ where: { id: interaction.user.id } });
    if (!player) {
      await interaction.reply({ content: `❌ Kayıtlı değilsin.`, flags: 64 });
      return;
    }
    if (player.coins < bet) {
      await interaction.reply({
        content: `❌ Yetersiz bakiye.\n> Mevcut: **${player.coins.toLocaleString('tr-TR')}** 💰 · Gerekli: **${bet}** 💰`,
        flags: 64,
      });
      return;
    }

    const deck = makeDeck();
    const playerHand: Card[] = [deck.pop()!, deck.pop()!];
    const dealerHand: Card[] = [deck.pop()!, deck.pop()!];

    // ── Anında Blackjack ──────────────────────────────────────────────────────
    if (isBlackjack(playerHand)) {
      const result = await settleBlackjack(ctx.prisma, interaction.user.id, bet, 'win');
      if (result.deltaCoins > 0) recordCoinsEarned(ctx.prisma, interaction.user.id, result.deltaCoins).catch(() => null);
      await interaction.reply({
        content: buildScreen({
          username, bet, playerHand, dealerHand,
          hideDealer: false, phase: 'ended',
          note: buildResultBanner('blackjack', result.deltaCoins, result.finalCoins),
        }),
      });
      return;
    }

    // ── İlk mesaj ─────────────────────────────────────────────────────────────
    await interaction.reply({
      content: buildScreen({
        username, bet, playerHand, dealerHand,
        hideDealer: true, phase: 'playing',
        note: `> 💭 *Hit mi Stand mı? (60s)*`,
      }),
      components: [buildRow()],
    });

    const msg = await interaction.fetchReply();

    // edit helper
    const edit = async (content: string, disabled = false): Promise<void> => {
      await interaction.editReply({
        content,
        components: [buildRow(disabled)],
      }).catch(() => null);
    };

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60_000,
      filter: (i) => i.user.id === interaction.user.id,
    });

    collector.on('collect', async (i) => {
      if (i.customId === 'bj_hit') {
        playerHand.push(deck.pop()!);
        const pv = handValue(playerHand);

        if (pv > 21) {
          // Bust
          collector.stop('bust');
          const result = await settleBlackjack(ctx.prisma, interaction.user.id, bet, 'lose');
          await i.update({
            content: buildScreen({
              username, bet, playerHand, dealerHand,
              hideDealer: false, phase: 'ended',
              note: buildResultBanner('bust', result.deltaCoins, result.finalCoins),
            }),
            components: [buildRow(true)],
          });
          return;
        }

        if (pv === 21) {
          // Otomatik stand
          collector.stop('stand');
          await i.update({
            content: buildScreen({
              username, bet, playerHand, dealerHand,
              hideDealer: true, phase: 'dealer',
              note: `> ✨ *21! Mükemmel — krupiyer oynuyor...*`,
            }),
            components: [buildRow(true)],
          });
          await runDealerTurn({
            edit, username, bet, playerHand, dealerHand, deck,
            ctx, userId: interaction.user.id,
          });
          return;
        }

        // Normal hit
        await i.update({
          content: buildScreen({
            username, bet, playerHand, dealerHand,
            hideDealer: true, phase: 'playing',
            note: `> ${pickRandom(HIT_TAUNTS)}`,
          }),
          components: [buildRow()],
        });

      } else if (i.customId === 'bj_stand') {
        collector.stop('stand');
        await i.update({
          content: buildScreen({
            username, bet, playerHand, dealerHand,
            hideDealer: true, phase: 'dealer',
            note: `> ${pickRandom(STAND_LINES)}`,
          }),
          components: [buildRow(true)],
        });
        await runDealerTurn({
          edit, username, bet, playerHand, dealerHand, deck,
          ctx, userId: interaction.user.id,
        });
      }
    });

    collector.on('end', async (_, reason) => {
      if (reason === 'time') {
        await interaction.editReply({
          content: buildScreen({
            username, bet, playerHand, dealerHand,
            hideDealer: true, phase: 'ended',
            note: `> ${TIMEOUT_LINE}`,
          }),
          components: [buildRow(true)],
        }).catch(() => null);
      }
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Bir şeyler ters gitti.';
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ embeds: [failEmbed('Hata', msg)] });
    } else {
      await interaction.reply({ embeds: [failEmbed('Hata', msg)], flags: 64 });
    }
  }
}

// ─── Text komutu handler (owl bj) ────────────────────────────────────────────
export async function handleBjTextCommand(
  message: Message,
  bet: number,
  ctx: CommandContext,
): Promise<void> {
  const userId      = message.author.id;
  const cooldownKey = `cooldown:bj:${userId}`;
  const remaining   = await getCooldownRemainingMs(ctx.redis, cooldownKey, GAMBLE_BJ_COOLDOWN_MS);
  if (remaining > 0) {
    await message.reply(`⏰ Tekrar blackjack için **${Math.ceil(remaining / 1000)}s** beklemelisin.`);
    return;
  }

  const username = message.member?.displayName ?? message.author.username;

  const player = await ctx.prisma.player.findUnique({ where: { id: userId } });
  if (!player || player.coins < bet) {
    await message.reply(`❌ Yetersiz bakiye. Mevcut: **${player?.coins ?? 0}** 💰`);
    return;
  }

  const deck = makeDeck();
  const playerHand: Card[] = [deck.pop()!, deck.pop()!];
  const dealerHand: Card[] = [deck.pop()!, deck.pop()!];

  // Anında Blackjack
  if (isBlackjack(playerHand)) {
    const result = await settleBlackjack(ctx.prisma, userId, bet, 'win');
    if (result.deltaCoins > 0) recordCoinsEarned(ctx.prisma, userId, result.deltaCoins).catch(() => null);
    await message.reply(
      buildScreen({
        username, bet, playerHand, dealerHand,
        hideDealer: false, phase: 'ended',
        note: buildResultBanner('blackjack', result.deltaCoins, result.finalCoins),
      }),
    );
    return;
  }

  const sent = await message.reply({
    content: buildScreen({
      username, bet, playerHand, dealerHand,
      hideDealer: true, phase: 'playing',
      note: `> 💭 *Hit mi Stand mı? (60s)*`,
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
        const result = await settleBlackjack(ctx.prisma, userId, bet, 'lose');
        await i.update({
          content: buildScreen({
            username, bet, playerHand, dealerHand,
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
            username, bet, playerHand, dealerHand,
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
          username, bet, playerHand, dealerHand,
          hideDealer: true, phase: 'playing',
          note: `> ${pickRandom(HIT_TAUNTS)}`,
        }),
        components: [buildRow()],
      });

    } else if (i.customId === 'bj_stand') {
      collector.stop('stand');
      await i.update({
        content: buildScreen({
          username, bet, playerHand, dealerHand,
          hideDealer: true, phase: 'dealer',
          note: `> ${pickRandom(STAND_LINES)}`,
        }),
        components: [buildRow(true)],
      });
      await runDealerTurn({ edit, username, bet, playerHand, dealerHand, deck, ctx, userId });
    }
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'time') {
      await edit(
        buildScreen({
          username, bet, playerHand, dealerHand,
          hideDealer: true, phase: 'ended',
          note: `> ${TIMEOUT_LINE}`,
        }),
        true,
      );
    }
  });
}

export default { data, execute } satisfies CommandDefinition;
