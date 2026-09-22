import { GAMBLE_COINFLIP_SPIN_MS } from '../config';
import { renderCoinSpinEmoji } from '../config/gamble-emojis';
import { COIN_EMOJI, formatCoinLabel } from '../config/ui-emojis';
import { awaitMinGifSpin } from './gamble-ux';

export type CoinFace = 'heads' | 'tails';

/** Dönen para gif emojisi — hydrate sonrası canlı ID. */
export let COIN_SPIN_EMOJI = renderCoinSpinEmoji();

export function refreshCoinSpinEmoji(): void {
  COIN_SPIN_EMOJI = renderCoinSpinEmoji();
}

const FACE_LABEL: Record<CoinFace, string> = {
  heads: 'YAZI',
  tails: 'TURA',
};

const PVP_FACE_LABEL: Record<CoinFace, string> = {
  heads: 'Head',
  tails: 'Tails',
};

export function parseCoinChoice(raw: string | undefined): CoinFace | undefined {
  if (!raw) return undefined;
  const n = raw.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (['heads', 'head', 'yazi', 'yaz', 'h'].includes(n)) return 'heads';
  if (['tails', 'tail', 'tura', 'tur', 't'].includes(n)) return 'tails';
  if (raw.toLowerCase() === 'yazı' || raw.toLowerCase() === 'yazi') return 'heads';
  return undefined;
}

export function oppositeFace(face: CoinFace): CoinFace {
  return face === 'heads' ? 'tails' : 'heads';
}

export function displayFace(face: CoinFace): string {
  return FACE_LABEL[face];
}

function formatBetAmount(bet: number): string {
  return Math.trunc(bet).toLocaleString('tr-TR');
}

function buildCfStakeLine(playerName: string, bet: number, choice?: CoinFace): string {
  const choicePart = choice
    ? ` ve "${displayFace(choice)}"yı seçti`
    : '';
  return `${playerName} ${COIN_EMOJI} ${formatBetAmount(bet)} harcadı${choicePart}.`;
}

/** İlk mesaj — gif oynarken edit yok */
export function buildCoinFlipSpinText(bet: number, playerName: string, choice?: CoinFace): string {
  return [
    buildCfStakeLine(playerName, bet, choice),
    `Para dönüyor… ${COIN_SPIN_EMOJI}`,
  ].join('\n');
}

/** Tek edit — sonuç */
export function buildCoinFlipResultText(params: {
  bet: number;
  playerName: string;
  win: boolean;
  resultFace: CoinFace;
  choice?: CoinFace;
  deltaCoins: number;
  /** Kayıp serisi koruması aktifse gösterilen satır (M2). */
  lossReliefNote?: string;
}): string {
  const { playerName, win, resultFace, bet, choice, lossReliefNote } = params;
  const spinOutcome = win
    ? `Para dönüyor… ${COIN_SPIN_EMOJI} ve ${displayFace(resultFace)} KAZANDIN!!`
    : `Para dönüyor… ${COIN_SPIN_EMOJI} ve hepsini KAYBETTİN :<`;
  return [
    buildCfStakeLine(playerName, bet, choice),
    spinOutcome,
    ...(lossReliefNote ? [lossReliefNote] : []),
  ].join('\n');
}

/** PvP — challenger Head, defender Tails */
export function buildPvpCoinFlipSpinText(
  challengerName: string,
  defenderName: string,
  _bet: number,
): string {
  return [
    `${COIN_EMOJI} PVP CoinFlip`,
    `${challengerName} ${PVP_FACE_LABEL.heads}`,
    `${defenderName} ${PVP_FACE_LABEL.tails}`,
    `Para dönüyor… ${COIN_SPIN_EMOJI}`,
  ].join('\n');
}

/** PvP — tek edit sonuç */
export function buildPvpCoinFlipResultText(params: {
  challengerName: string;
  defenderName: string;
  winnerName: string;
  loserName: string;
  winnerGain: number;
  loserLoss: number;
  bet: number;
  resultFace: CoinFace;
  rebate?: { lossStreak: number; amount: number; playerName: string } | null;
}): string {
  void params.loserName;
  void params.loserLoss;
  void params.bet;
  void params.rebate;
  const { challengerName, defenderName, winnerName, winnerGain, resultFace } = params;
  return [
    `${COIN_EMOJI} PVP CoinFlip`,
    `${challengerName} ${PVP_FACE_LABEL.heads}`,
    `${defenderName} ${PVP_FACE_LABEL.tails}`,
    `Para döndü ve ${PVP_FACE_LABEL[resultFace]}, ${winnerName} Kazandı!! ${formatCoinLabel(winnerGain)}`,
  ].join('\n');
}

/** Gif süresi + DB işlemi paralel; sonrasında tek edit */
export async function awaitCoinFlipSpin(startedAt: number): Promise<void> {
  await awaitMinGifSpin(startedAt, GAMBLE_COINFLIP_SPIN_MS);
}
