import { describe, it, expect } from "vitest";
import { resolveMoonTierFromPower, getMoonTierDef } from "../config/owl-moon-tier";
import { calcOwlStatSumPower, parseEvolutionHistory, resolveOwlMoonTierFromStats } from "../systems/owl-moon-evolution";
import { renderMoonEmoji, renderOwlMoonEmoji } from "../config/custom-emojis";

describe("owl-moon-evolution", () => {
  it("resolveMoonTierFromPower maps power to moon tier", () => {
    expect(resolveMoonTierFromPower(0)).toBe(1);
    expect(resolveMoonTierFromPower(99)).toBe(1);
    expect(resolveMoonTierFromPower(100)).toBe(2);
    expect(resolveMoonTierFromPower(600)).toBe(7);
  });

  it("calcOwlStatSumPower sums effective stats", () => {
    expect(calcOwlStatSumPower({
      statGaga: 20, statGoz: 20, statKulak: 20, statKanat: 20, statPence: 20,
    })).toBe(100);
  });

  it("parseEvolutionHistory reads moon tier history", () => {
    const history = parseEvolutionHistory([
      { moonTier: 1, unlockedAt: "2026-01-01T00:00:00.000Z" },
      { moonTier: 2, unlockedAt: "2026-02-01T00:00:00.000Z" },
    ]);
    expect(history).toHaveLength(2);
    expect(history[1]?.moonTier).toBe(2);
  });

  it("resolveOwlMoonTierFromStats uses current power not stored moonTier", () => {
    expect(resolveOwlMoonTierFromStats({
      moonTier: 5,
      statGaga: 77, statGoz: 75, statKulak: 65, statKanat: 82, statPence: 78,
    })).toBe(4);
  });

  it("getMoonTierDef returns Moon IV aura", () => {
    expect(getMoonTierDef(4)?.aura).toBe("Kadim Aura");
  });

  it("renderMoonEmoji and renderOwlMoonEmoji use embedded IDs", () => {
    expect(renderMoonEmoji(1)).toContain("moon_1_quarter");
    expect(renderOwlMoonEmoji(8, 1)).toContain("owl_8_t1");
  });
});
