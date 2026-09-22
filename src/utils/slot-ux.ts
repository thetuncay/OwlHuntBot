import { SLOT_REEL_STOP_MS, SLOT_TABLE } from '../config';
import { renderOwlMoonEmoji } from '../config/custom-emojis';
import { renderGambleEmoji, renderSlotsRollingEmoji } from '../config/gamble-emojis';
import { COIN_EMOJI, formatCoinLabel } from '../config/ui-emojis';
import { resultPipe } from './result-ux';

/** Custom Discord emojileri — Ganimet Makinesi (hydrate sonrası canlı ID). */
export const SLOT_EMOJI = {
  get owl() { return renderOwlMoonEmoji(4, 4); },
  get diamond() { return renderGambleEmoji('diamond', '💎'); },
  get coin() { return renderGambleEmoji('coin', '🪙'); },
  get poop() { return renderGambleEmoji('image', '💩'); },
  get rolling() { return renderSlotsRollingEmoji(); },
};

export type SlotReelCell = 'rolling' | 'empty' | string;

const SLOT_MACHINE_TITLE = '🎰 SLOT MAKİNESİ';
const PVP_SLOT_TITLE = '🎰 PVP SLOT';

export function renderSlotSymbol(key: string): string {
  if (key in SLOT_EMOJI && key !== 'rolling') {
    return SLOT_EMOJI[key as keyof typeof SLOT_EMOJI];
  }
  return '❓';
}

function renderReelCell(cell: SlotReelCell): string {
  if (cell === 'rolling') return SLOT_EMOJI.rolling;
  if (cell === 'empty') return '▫️';
  return renderSlotSymbol(cell);
}

/** Üç makara — aralıklı, okunaklı */
export function buildSlotLine(cells: SlotReelCell[]): string {
  const [a = 'empty', b = 'empty', c = 'empty'] = cells;
  return `${renderReelCell(a)}  ${renderReelCell(b)}  ${renderReelCell(c)}`;
}

export function buildSlotHeader(): string {
  return SLOT_MACHINE_TITLE;
}

function payoutMultLabel(payout: number): string {
  if (payout <= 0) return 'x0';
  const n = Number.isInteger(payout) ? String(payout) : String(payout);
  return `x${n}`;
}

/** Çarpan tablosu — her satır bir üçlü */
export function buildSlotPayoutHint(): string {
  return SLOT_TABLE.map((row) => {
    const e = renderSlotSymbol(row.symbolKey);
    return resultPipe(`${e} ${e} ${e}  **${payoutMultLabel(row.payout)}**`);
  }).join('\n');
}

/** `w slot` — bahis yokken çarpan tablosu */
export function buildSlotHelpMessage(): string {
  return [SLOT_MACHINE_TITLE, '', buildSlotPayoutHint()].join('\n');
}

export function slotPayoutTag(symbolKey: string): string {
  const row = SLOT_TABLE.find((r) => r.symbolKey === symbolKey);
  return row ? payoutMultLabel(row.payout) : '';
}

function formatSlotPlayerBet(playerName: string, bet: number): string {
  const coinPart = formatCoinLabel(bet).replace(`${COIN_EMOJI} `, '');
  return `${playerName} · ${coinPart}`;
}

function buildSoloSlotSpinScreen(params: {
  playerName: string;
  bet: number;
  reels: SlotReelCell[];
}): string {
  return [
    SLOT_MACHINE_TITLE,
    resultPipe(buildSlotLine(params.reels)),
    resultPipe(formatSlotPlayerBet(params.playerName, params.bet)),
  ].join('\n');
}

/** İlk mesaj — üç makara gif */
export function buildSlotSpinText(playerName: string, bet: number): string {
  return buildSoloSlotSpinScreen({
    playerName,
    bet,
    reels: ['rolling', 'rolling', 'rolling'],
  });
}

/** Son edit — kazanç / kayıp */
export function buildSlotResultScreen(params: {
  playerName: string;
  bet: number;
  finalSymbols: [string, string, string];
  win: boolean;
  deltaCoins: number;
}): string {
  const lines = [
    SLOT_MACHINE_TITLE,
    resultPipe(buildSlotLine(params.finalSymbols)),
    resultPipe(formatSlotPlayerBet(params.playerName, params.bet)),
  ];
  if (params.win) {
    lines.push(resultPipe(`+${Math.abs(params.deltaCoins).toLocaleString('tr-TR')}`));
  } else {
    lines.push(resultPipe('Kayıp'));
  }
  return lines.join('\n');
}

function buildPvpSlotSpinScreen(params: {
  challengerName: string;
  defenderName: string;
  challengerReels: SlotReelCell[];
  defenderReels: SlotReelCell[];
}): string {
  return [
    PVP_SLOT_TITLE,
    resultPipe(`${buildSlotLine(params.challengerReels)}  ${params.challengerName}`),
    resultPipe(`${buildSlotLine(params.defenderReels)}  ${params.defenderName}`),
  ].join('\n');
}

/** PvP — ilk mesaj + animasyon kareleri */
export function buildPvpSlotSpinText(
  challengerName: string,
  defenderName: string,
  _bet: number,
): string {
  return buildPvpSlotSpinScreen({
    challengerName,
    defenderName,
    challengerReels: ['rolling', 'rolling', 'rolling'],
    defenderReels: ['rolling', 'rolling', 'rolling'],
  });
}

/** Makaraları sırayla durdurur — her makara bir edit */
export async function animateSlotReels(
  edit: (content: string) => Promise<unknown>,
  params: {
    playerName: string;
    bet: number;
    finalSymbols: [string, string, string];
    frameMs?: number;
  },
): Promise<void> {
  const frameMs = params.frameMs ?? SLOT_REEL_STOP_MS;
  const reels: SlotReelCell[] = ['rolling', 'rolling', 'rolling'];

  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, frameMs));
    reels[i] = params.finalSymbols[i]!;
    await edit(buildSoloSlotSpinScreen({
      playerName: params.playerName,
      bet: params.bet,
      reels,
    }));
  }
}

/** PvP — iki oyuncunun makaraları aynı anda tek tek durur */
export async function animatePvpSlotReels(
  edit: (content: string) => Promise<unknown>,
  params: {
    challengerName: string;
    defenderName: string;
    bet: number;
    challengerFinal: [string, string, string];
    defenderFinal: [string, string, string];
    frameMs?: number;
  },
): Promise<void> {
  const frameMs = params.frameMs ?? SLOT_REEL_STOP_MS;
  const cReels: SlotReelCell[] = ['rolling', 'rolling', 'rolling'];
  const dReels: SlotReelCell[] = ['rolling', 'rolling', 'rolling'];

  const render = () => edit(buildPvpSlotSpinScreen({
    challengerName: params.challengerName,
    defenderName: params.defenderName,
    challengerReels: cReels,
    defenderReels: dReels,
  }));

  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, frameMs));
    cReels[i] = params.challengerFinal[i]!;
    dReels[i] = params.defenderFinal[i]!;
    await render();
  }
}

export function slotLabelForKey(symbolKey: string): string {
  return SLOT_TABLE.find((row) => row.symbolKey === symbolKey)?.label ?? symbolKey;
}
