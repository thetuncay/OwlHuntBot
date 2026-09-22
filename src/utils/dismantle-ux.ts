import { DISMANTLE_TABLE } from '../config';
import { renderItemEmoji, renderPreyEmoji } from '../config/custom-emojis';

export interface DismantleStack {
  itemName: string;
  quantity: number;
}

/** DISMANTLE_TABLE anahtar sırası — `w parçala stat` tarif listesi. */
export const DISMANTLEABLE_PREY: readonly string[] = Object.keys(DISMANTLE_TABLE);

export interface DismantleOwnedItem {
  itemName: string;
  quantity: number;
}

function sortByQuantityDesc<T extends { quantity: number; itemName: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.quantity - a.quantity || a.itemName.localeCompare(b.itemName, 'tr'));
}

export function formatDismantledPreyLine(itemName: string, quantity: number): string {
  return `${renderPreyEmoji(itemName)} **${quantity}x ${itemName}**`;
}

export function formatProducedMaterials(produced: DismantleStack[]): string {
  return sortByQuantityDesc(produced)
    .map((p) => `${renderItemEmoji(p.itemName)} **${p.quantity}x ${p.itemName}**`)
    .join(', ');
}

/** Görseldeki toplu parçalama çıktısı: av listesi + Elde edilen satırı. */
export function buildBulkDismantleMessage(
  dismantled: DismantleStack[],
  produced: DismantleStack[],
): string {
  const preyLines = sortByQuantityDesc(dismantled)
    .map((d) => formatDismantledPreyLine(d.itemName, d.quantity))
    .join('\n');
  const materials = formatProducedMaterials(produced);

  return [`**Toplu Parçalama**`, preyLines, '', `**Elde edilen:** ${materials}`].join('\n');
}

export function buildSingleDismantleMessage(
  itemName: string,
  quantity: number,
  produced: DismantleStack[],
): string {
  const materials = formatProducedMaterials(produced);
  return [
    formatDismantledPreyLine(itemName, quantity),
    '',
    `**Elde edilen:** ${materials}`,
  ].join('\n');
}

/**
 * Tek av tarif satırı. Yan etki yok.
 *
 * @param preyName DISMANTLE_TABLE anahtarı
 */
export function formatDismantleRecipeLine(preyName: string): string {
  const outputs = DISMANTLE_TABLE[preyName];
  const recipe = outputs?.length
    ? outputs
        .map((o) => `${o.itemName} (${o.min}${o.max > o.min ? `–${o.max}` : ''})`)
        .join(', ')
    : '—';
  return `${renderPreyEmoji(preyName)} ${preyName} → ${recipe}`;
}

/**
 * Tüm parçalama tarifleri (`w parçala stat`).
 *
 * @returns Sadece tarif satırları; envanter miktarı yok
 */
export function buildDismantleStatMessage(): string {
  return DISMANTLEABLE_PREY.map(formatDismantleRecipeLine).join('\n');
}

/**
 * Oyuncunun sahip olduğu parçalanabilir avlar (`w parçala`).
 *
 * @param owned Envanterdeki parçalanabilir yığınlar
 * @param prefix Guild prefix (`w`)
 */
export function buildDismantleOwnedMessage(
  owned: DismantleOwnedItem[],
  prefix: string,
): string {
  const lines = ['🍖 **PARÇALANABİLİR AVLAR**'];
  if (owned.length === 0) {
    lines.push('  —');
  } else {
    for (const item of sortByQuantityDesc(owned)) {
      lines.push(`  ${renderPreyEmoji(item.itemName)} **${item.itemName}** ×${item.quantity}`);
    }
  }
  lines.push(`  ↳ \`${prefix} parçala all\` · \`${prefix} parçala stat\``);
  return lines.join('\n');
}
