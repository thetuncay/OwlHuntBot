import { describe, it, expect } from "vitest";
import {
  buildOwoStyleOwlGrid,
  buildOwoStyleOwlGridRows,
  buildOwoStyleTierFooter,
  countOwlsByMoon,
} from "../utils/owl-moon-grid";
import { buildOwlsZooMessages, buildOwlsZooText, DISCORD_MAX_CONTENT_LENGTH } from "../utils/owls-ux";

describe("owl-moon-grid", () => {
  it("buildOwoStyleOwlGridRows shows only unlocked moon tiers and species", () => {
    const rows = buildOwoStyleOwlGridRows([
      { speciesTier: 8, moonTier: 1, count: 1, isMain: true },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatch(/owl_8_t1|🦉/);
    expect(buildOwoStyleOwlGridRows([])).toHaveLength(0);
  });

  it("buildOwoStyleOwlGrid omits empty matrix slots", () => {
    const grid = buildOwoStyleOwlGrid([
      { speciesTier: 8, moonTier: 1, count: 1, isMain: true },
    ]);
    expect(grid.split("\n")).toHaveLength(1);
    expect(grid).not.toContain("❓");
  });

  it("buildOwoStyleTierFooter lists only non-zero moon tiers", () => {
    const footer = buildOwoStyleTierFooter(countOwlsByMoon([
      { speciesTier: 8, moonTier: 1, count: 1 },
    ]));
    expect(footer).toBe("1-1");
  });
});

describe("owls-ux", () => {
  const sampleOwl = {
    id: "1",
    species: "Kukumav baykusu",
    tier: 8,
    moonTier: 1,
    quality: "Common",
    hp: 100,
    hpMax: 100,
    isMain: true,
    statGaga: 20,
    statGoz: 20,
    statKulak: 20,
    statKanat: 20,
    statPence: 20,
  };

  it("buildOwlsZooText returns OwO-style header without prestige label", () => {
    const text = buildOwlsZooText({
      username: "Tuncay",
      helpPrefix: "w",
      owls: [sampleOwl],
    });
    expect(text).toContain("**🌿 🌱 🌳 Tuncay'in Baykuşları! 🌳 🌿 🌱**");
    expect(text).not.toMatch(/^#/m);
    expect(text).toContain("2-1");
    expect(text).not.toContain('⭐');
    expect(text).toContain('`w owllist`');
    expect(text).toContain('`w setmain <id>`');
  });

  it('buildOwlsZooMessages keeps grid inline with header', () => {
    const parts = buildOwlsZooMessages({
      username: 'OsuranCabbar',
      helpPrefix: 'w',
      owls: [sampleOwl],
    });
    expect(parts[0]).toContain('Baykuşları');
    expect(parts[0]).toContain('moon_');
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(DISCORD_MAX_CONTENT_LENGTH);
    }
  });
});
