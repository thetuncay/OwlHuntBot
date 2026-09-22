/**
 * w zoo — baykuş koleksiyonu alt bölümü (OwO grid).
 */
import { OWL_SPECIES } from '../config';
import { packDiscordLines } from './discord-content';
import {
  buildOwoStyleOwlGridRows,
  buildOwoStyleTierFooter,
  countOwlsByMoon,
} from './owl-moon-grid';
import { aggregateOwlsToCells, type OwlCardInput } from './owls-ux';

export interface OwlZooRenderData {
  username: string;
  owls: OwlCardInput[];
}

export function buildOwlZooSectionLines(data: OwlZooRenderData): string[] {
  const { username, owls } = data;
  const discoveredSpecies = new Set(owls.map((o) => o.tier)).size;

  const cells = aggregateOwlsToCells(owls);
  const tierFooter = buildOwoStyleTierFooter(countOwlsByMoon(cells));
  const gridRows = buildOwoStyleOwlGridRows(cells);

  const lines: string[] = [
    '---',
    `**🌿 🌱 🌳 ${username}'in Baykuş Koleksiyonu! 🌳 🌿 🌱**`,
    ...(gridRows.length > 0 ? gridRows : ['_Henüz açılmış varyant yok._']),
  ];

  if (tierFooter) {
    lines.push(tierFooter);
  }

  lines.push(`-# ${discoveredSpecies}/${OWL_SPECIES.length} tür açıldı`);

  return lines;
}

export function buildOwlZooSectionMessages(data: OwlZooRenderData): string[] {
  return packDiscordLines(buildOwlZooSectionLines(data));
}

export function buildOwlZooSection(data: OwlZooRenderData): string {
  return buildOwlZooSectionLines(data).join('\n');
}
