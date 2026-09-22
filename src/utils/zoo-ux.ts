/**
 * zoo-ux.ts — OwO tarzı hayvanat bahçesi grid (düz metin, embed yok)
 */
import { PREY, PREY_MIN_SELL_PRICE } from '../config';
import { formatCoinLabel } from '../config/ui-emojis';
import { renderEmoji, renderPreyEmoji } from '../config/custom-emojis';
import type { PreyDexRow } from '../systems/prey-dex';
import type { OwlCardInput } from './owls-ux';
import { buildOwlZooSectionLines } from './owl-zoo-ux';
import { packDiscordLines } from './discord-content';
import {
  buildPreyDexProgressLine,
  computePreyDexProgress,
} from './prey-dex-ux';
import { toSuperscriptQty } from './theme';

const ZOO_COLS = 7;
const ZOO_CELL_GAP = '    ';

/** Keşfedilmemiş hücre — özel `soru` emojisi (yoksa ❓). */
function unknownZooCell(): string {
  return renderEmoji('ui.soru', '❓');
}

export interface ZooRenderData {
  username:     string;
  rows:         PreyDexRow[];
  helpPrefix:   string;
}

function formatZooCell(row: PreyDexRow): string {
  if (!row.discovered) return unknownZooCell();
  const emoji = renderPreyEmoji(row.preyName);
  return `${emoji}${toSuperscriptQty(row.inventoryQty)}`;
}

function sellPriceFor(preyName: string): number {
  return PREY.find((p) => p.name === preyName)?.sellPrice ?? PREY_MIN_SELL_PRICE;
}

function buildZooGridRows(rows: PreyDexRow[]): string[] {
  const cells = rows.map(formatZooCell);
  const lines: string[] = [];
  for (let i = 0; i < cells.length; i += ZOO_COLS) {
    lines.push(cells.slice(i, i + ZOO_COLS).join(ZOO_CELL_GAP));
  }
  return lines;
}

function buildZooLines(data: ZooRenderData): string[] {
  const { username, rows } = data;

  const totalInInv = rows.reduce((s, r) => s + r.inventoryQty, 0);
  const totalValue = rows.reduce(
    (s, r) => s + r.inventoryQty * sellPriceFor(r.preyName),
    0,
  );
  const lifetimeCaught = rows.reduce((s, r) => s + r.totalCaught, 0);

  // B5 — ilerleme çubuğu koleksiyonu somut bir hedefe çevirir.
  const progress = computePreyDexProgress(rows);

  return [
    `**🌿 ${username}'in Hayvanat Bahçesi 🌿**`,
    `${buildPreyDexProgressLine(progress)} · Envanterde **${totalInInv}** hayvan · ${formatCoinLabel(totalValue)}`,
    ...buildZooGridRows(rows),
    `-# Toplam yakalanan ${lifetimeCaught}`,
    ...(progress.missing.length === 0
      ? ['🏆 Defterin tamam — her türü kaydettin.']
      : []),
  ];
}

/** OwO tarzı düz metin zoo — kalın başlık + sıkı grid. */
export function buildZooText(data: ZooRenderData): string {
  return buildZooLines(data).join('\n');
}

export interface FullZooRenderData extends ZooRenderData {
  owls: OwlCardInput[];
}

/** Av grid (üst) + baykuş koleksiyonu (alt). */
export function buildFullZooText(data: FullZooRenderData): string {
  return buildFullZooMessages(data).join('\n\n');
}

/** Discord 2000 sınırına uygun zoo mesajları. */
export function buildFullZooMessages(data: FullZooRenderData): string[] {
  return packDiscordLines([
    ...buildZooLines(data),
    ...buildOwlZooSectionLines({ username: data.username, owls: data.owls }),
  ]);
}
