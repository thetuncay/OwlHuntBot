/**
 * OwO zoo tarzı grid — sol moon sütunu + yalnızca açılmış baykuşlar.
 */
import { OWL_SPECIES } from "../config";
import { OWL_MOON_TIERS } from "../config/owl-moon-tier";
import { renderMoonEmoji, renderOwlMoonEmoji } from "../config/custom-emojis";

export interface OwlMoonCell {
  speciesTier: number;
  moonTier: number;
  count: number;
  isMain?: boolean;
}

const CELL_GAP = " ";
const MOON_GAP = " ";

function cellKey(speciesTier: number, moonTier: number): string {
  return `${speciesTier}:${moonTier}`;
}

function buildCountMap(cells: OwlMoonCell[]): Map<string, OwlMoonCell> {
  const map = new Map<string, OwlMoonCell>();
  for (const c of cells) {
    const key = cellKey(c.speciesTier, c.moonTier);
    const cur = map.get(key) ?? { speciesTier: c.speciesTier, moonTier: c.moonTier, count: 0, isMain: false };
    cur.count += c.count;
    if (c.isMain) cur.isMain = true;
    map.set(key, cur);
  }
  return map;
}

function formatOwnedCell(c: OwlMoonCell): string {
  return renderOwlMoonEmoji(c.speciesTier, c.moonTier);
}

export function buildOwoStyleOwlGridRows(cells: OwlMoonCell[]): string[] {
  const counts = buildCountMap(cells);

  return OWL_MOON_TIERS
    .map((t) => {
      const tierCells = OWL_SPECIES
        .map((sp) => counts.get(cellKey(sp.tier, t.moonTier)))
        .filter((c): c is OwlMoonCell => !!c && c.count > 0);

      if (tierCells.length === 0) return null;

      const moon = renderMoonEmoji(t.moonTier);
      return `${moon}${MOON_GAP}${tierCells.map(formatOwnedCell).join(CELL_GAP)}`;
    })
    .filter((row): row is string => row !== null);
}

export function buildOwoStyleOwlGrid(cells: OwlMoonCell[]): string {
  const rows = buildOwoStyleOwlGridRows(cells);
  return rows.length > 0 ? rows.join("\n") : "_Henüz açılmış varyant yok._";
}

export function buildOwoStyleTierFooter(counts: Map<number, number>): string {
  const parts = [...OWL_MOON_TIERS]
    .reverse()
    .filter((t) => (counts.get(t.moonTier) ?? 0) > 0)
    .map((t) => `${t.moonTier}-${counts.get(t.moonTier)}`);
  return parts.join(", ");
}

export function countOwlsByMoon(cells: OwlMoonCell[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of cells) {
    m.set(c.moonTier, (m.get(c.moonTier) ?? 0) + c.count);
  }
  return m;
}
