import { SLOT_TABLE } from '../../config';
import { weightedRandom } from '../../utils/rng';

export type SlotSymbolKey = (typeof SLOT_TABLE)[number]['symbolKey'];

const SLOT_SYMBOLS = SLOT_TABLE.map((row) => row.symbolKey) as SlotSymbolKey[];
const PAYING_SYMBOLS = SLOT_TABLE.filter((row) => row.payout > 0).map(
  (row) => row.symbolKey,
) as SlotSymbolKey[];

function shuffleTriple<T>(items: [T, T, T]): [T, T, T] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return [arr[0]!, arr[1]!, arr[2]!];
}

function pickSymbol(exclude: SlotSymbolKey[] = []): SlotSymbolKey {
  const pool = SLOT_SYMBOLS.filter((s) => !exclude.includes(s));
  return pool[Math.floor(Math.random() * pool.length)] ?? 'poop';
}

/** Kazandıran (ödüllü) üçlü mü? */
export function isPayingTriple(reels: [string, string, string]): boolean {
  const [a, b, c] = reels;
  return a === b && b === c && PAYING_SYMBOLS.includes(a as SlotSymbolKey);
}

function buildLossReels(): [string, string, string] {
  const pattern = weightedRandom([
    { value: 'poop_triple' as const, weight: 15 },
    { value: 'near_miss' as const, weight: 50 },
    { value: 'mixed' as const, weight: 35 },
  ]);

  let reels: [string, string, string];
  if (pattern === 'poop_triple') {
    reels = ['poop', 'poop', 'poop'];
  } else if (pattern === 'near_miss') {
    // İki aynı ödüllü sembol + farklı filler — görünür ama ödeme yok
    const pay = PAYING_SYMBOLS[Math.floor(Math.random() * PAYING_SYMBOLS.length)] ?? 'coin';
    const filler = pickSymbol([pay]);
    reels = shuffleTriple([pay, pay, filler]);
  } else {
    const a = pickSymbol();
    const b = pickSymbol([a]);
    const c = pickSymbol([a, b]);
    reels = shuffleTriple([a, b, c]);
  }

  // Kayıpta asla ödüllü üçlü göstermeyelim.
  if (isPayingTriple(reels)) {
    return ['poop', 'poop', 'poop'];
  }
  return reels;
}

export function rollSlotOutcome(): (typeof SLOT_TABLE)[number] {
  return weightedRandom(SLOT_TABLE.map((entry) => ({ value: entry, weight: entry.chance })));
}

/**
 * Görsel makara:
 * - Kazanç (payout > 0): her zaman outcome'un tam üçlüsü
 * - Kayıp: near-miss (2 aynı+1 farklı) / 3 farklı / bazen 💩💩💩
 *   (ödüllü üçlü asla yok)
 *
 * Ödeme her zaman roll.payout üzerinden; karışık görsel asla ödeme tetiklemez.
 */
export function buildSlotReels(outcomeKey: SlotSymbolKey): [string, string, string] {
  const row = SLOT_TABLE.find((entry) => entry.symbolKey === outcomeKey);
  if (row && row.payout > 0) {
    return [outcomeKey, outcomeKey, outcomeKey];
  }
  return buildLossReels();
}

/** @deprecated buildSlotReels kullan */
export function slotTriple(symbolKey: string): [string, string, string] {
  return buildSlotReels(symbolKey as SlotSymbolKey);
}

/** Slot kazancı: x2 = bahsin 2 katı coin (100 bahis → +200). x0 = bahis kaybı. */
export function calcSlotCoinGain(bet: number, payout: number): number {
  if (payout <= 0) return -bet;
  return Math.floor(bet * payout);
}

export function compareSlotTriples(a: string, b: string): number {
  const payoutA = SLOT_TABLE.find((row) => row.symbolKey === a)?.payout ?? 0;
  const payoutB = SLOT_TABLE.find((row) => row.symbolKey === b)?.payout ?? 0;
  return payoutA - payoutB;
}
