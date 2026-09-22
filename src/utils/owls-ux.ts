/**
 * w owls — OwO zoo tarzı düz metin (embed yok).
 */
import { OWL_SPECIES } from '../config';
import { calcOwlStatSumPower, resolveOwlMoonTierFromStats } from '../systems/owl-moon-evolution';
import { DISCORD_MAX_CONTENT_LENGTH, packDiscordLines } from './discord-content';
import {
  buildOwoStyleOwlGridRows,
  buildOwoStyleTierFooter,
  countOwlsByMoon,
  type OwlMoonCell,
} from './owl-moon-grid';

export interface OwlCardInput {
  id: string;
  species: string;
  nickname?: string | null;
  tier: number;
  moonTier?: number;
  quality: string;
  hp: number;
  hpMax: number;
  isMain: boolean;
  statGaga: number;
  statGoz: number;
  statKulak: number;
  statKanat: number;
  statPence: number;
  statGagaBase?: number;
  statGozBase?: number;
  statKulakBase?: number;
  statKanatBase?: number;
  statPenceBase?: number;
  statGagaTrained?: number;
  statGozTrained?: number;
  statKulakTrained?: number;
  statKanatTrained?: number;
  statPenceTrained?: number;
}

export interface OwlsZooRenderData {
  username: string;
  owls: OwlCardInput[];
  helpPrefix: string;
}

export function aggregateOwlsToCells(owls: OwlCardInput[]): OwlMoonCell[] {
  const map = new Map<string, OwlMoonCell>();
  for (const owl of owls) {
    const speciesTier = owl.tier;
    const moonTier = resolveOwlMoonTierFromStats(owl);
    const key = `${speciesTier}:${moonTier}`;
    const cur = map.get(key) ?? { speciesTier, moonTier, count: 0, isMain: false };
    cur.count++;
    if (owl.isMain) cur.isMain = true;
    map.set(key, cur);
  }
  return [...map.values()];
}

function buildOwlsZooLines(data: OwlsZooRenderData): string[] {
  const { username, owls, helpPrefix } = data;
  const totalPower = owls.reduce((s, o) => s + calcOwlStatSumPower(o), 0);
  const cells = aggregateOwlsToCells(owls);
  const tierFooter = buildOwoStyleTierFooter(countOwlsByMoon(cells));
  const discoveredSpecies = new Set(owls.map((o) => o.tier)).size;
  const gridRows = buildOwoStyleOwlGridRows(cells);

  const lines: string[] = [
    `**🌿 🌱 🌳 ${username}'in Baykuşları! 🌳 🌿 🌱**`,
    ...(gridRows.length > 0 ? gridRows : ['_Henüz açılmış varyant yok._']),
  ];

  if (tierFooter) {
    lines.push(tierFooter);
  }

  lines.push(
    `-# Güç ${totalPower.toLocaleString('tr-TR')} · ${discoveredSpecies}/${OWL_SPECIES.length} tür · ID: \`${helpPrefix} owllist\` · Main: \`${helpPrefix} setmain <id>\``,
  );

  return lines;
}

export function buildOwlsZooMessages(data: OwlsZooRenderData): string[] {
  return packDiscordLines(buildOwlsZooLines(data));
}

export function buildOwlsZooText(data: OwlsZooRenderData): string {
  return buildOwlsZooLines(data).join('\n');
}

export { DISCORD_MAX_CONTENT_LENGTH };
