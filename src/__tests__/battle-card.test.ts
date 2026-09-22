import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  BATTLE_CARD_DIMENSIONS,
  combatFromParts,
  damageTextPosition,
  renderBattleCardPng,
  type BattleCardFighter,
} from '../utils/battle-card';

const GOLDEN_LEFT: BattleCardFighter = {
  name: 'thetuncay',
  hp: 98,
  hpMax: 100,
  energy: 84,
  energyMax: 100,
  atk: 358,
  def: 304,
  spd: 269,
  crt: 57,
  tier: 4,
  moon: 3,
  streak: 7,
  winner: true,
};

const GOLDEN_RIGHT: BattleCardFighter = {
  name: 'xavor918',
  hp: 0,
  hpMax: 100,
  energy: 60,
  energyMax: 100,
  atk: 36,
  def: 31,
  spd: 27,
  crt: 6,
  tier: 8,
  moon: 1,
  down: true,
};

const REGRESSION_LEFT: BattleCardFighter = {
  name: 'Tuncay',
  hp: 25,
  hpMax: 100,
  energy: 68,
  energyMax: 100,
  ...combatFromParts({ gaga: 13, pence: 10, goz: 6, kulak: 10, kanat: 11 }),
  tier: 8,
  moon: 1,
  streak: 1,
  winner: true,
};

const REGRESSION_RIGHT: BattleCardFighter = {
  name: 'Bronz Kartalı',
  hp: 0,
  hpMax: 89,
  energy: 67,
  energyMax: 100,
  atk: 13,
  def: 9,
  spd: 8,
  crt: 65,
  tier: 1,
  moon: 1,
  down: true,
};

describe('renderBattleCardPng', () => {
  it('uses the 1280x504 reference design space', () => {
    expect(BATTLE_CARD_DIMENSIONS.designWidth).toBe(1280);
    expect(BATTLE_CARD_DIMENSIONS.designHeight).toBe(504);
    expect(BATTLE_CARD_DIMENSIONS.width).toBe(
      Math.round(BATTLE_CARD_DIMENSIONS.designWidth * BATTLE_CARD_DIMENSIONS.scale),
    );
    expect(BATTLE_CARD_DIMENSIONS.height).toBe(
      Math.round(BATTLE_CARD_DIMENSIONS.designHeight * BATTLE_CARD_DIMENSIONS.scale),
    );
  });

  it('renders the golden fixture at the reference resolution', async () => {
    const png = await renderBattleCardPng({
      left: GOLDEN_LEFT,
      right: GOLDEN_RIGHT,
    });
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(BATTLE_CARD_DIMENSIONS.width);
    expect(meta.height).toBe(BATTLE_CARD_DIMENSIONS.height);
    expect(png.length).toBeGreaterThan(1000);
  });

  it('keeps the reference aspect ratio', () => {
    const aspect = BATTLE_CARD_DIMENSIONS.width / BATTLE_CARD_DIMENSIONS.height;
    expect(aspect).toBeCloseTo(1280 / 504, 3);
  });

  it('renders regression duel without empty layout failure', async () => {
    const png = await renderBattleCardPng({
      left: REGRESSION_LEFT,
      right: REGRESSION_RIGHT,
    });
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(BATTLE_CARD_DIMENSIONS.width);
    expect(meta.height).toBe(BATTLE_CARD_DIMENSIONS.height);
    expect(png.length).toBeGreaterThan(500);
  });

  it('renders mid-battle state with no winner or down fighter', async () => {
    const png = await renderBattleCardPng({
      left: { ...GOLDEN_LEFT, winner: false, streak: 0, acting: true },
      right: { ...GOLDEN_RIGHT, down: false, hp: 74 },
    });
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(BATTLE_CARD_DIMENSIONS.width);
    expect(png.length).toBeGreaterThan(500);
  });

  it('renders hit effects (damage popup + hp ghost trail)', async () => {
    const plain = await renderBattleCardPng({
      left: { ...GOLDEN_LEFT, winner: false, streak: 0, hp: 60 },
      right: { ...GOLDEN_RIGHT, down: false, hp: 45 },
    });
    const withFx = await renderBattleCardPng({
      left: { ...GOLDEN_LEFT, winner: false, streak: 0, hp: 60 },
      right: { ...GOLDEN_RIGHT, down: false, hp: 45, hpGhost: 78, damage: 33 },
    });
    const meta = await sharp(withFx).metadata();
    expect(meta.width).toBe(BATTLE_CARD_DIMENSIONS.width);
    expect(meta.height).toBe(BATTLE_CARD_DIMENSIONS.height);
    expect(withFx.equals(plain)).toBe(false);
  });

  it('damageTextPosition samples varied points inside portrait box', () => {
    const leftPortrait = { x: 14, w: 202, y: 131, h: 202 };
    const rightPortrait = { x: 1067, w: 202, y: 131, h: 202 };
    const inset = 32;

    const leftXs = new Set<number>();
    const leftYs = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const L = damageTextPosition('left');
      expect(L.cx).toBeGreaterThanOrEqual(leftPortrait.x + inset);
      expect(L.cx).toBeLessThanOrEqual(leftPortrait.x + leftPortrait.w - inset);
      expect(L.cy).toBeGreaterThanOrEqual(leftPortrait.y + inset);
      expect(L.cy).toBeLessThanOrEqual(leftPortrait.y + leftPortrait.h - inset);
      leftXs.add(Math.round(L.cx));
      leftYs.add(Math.round(L.cy));

      const R = damageTextPosition('right');
      expect(R.cx).toBeGreaterThanOrEqual(rightPortrait.x + inset);
      expect(R.cx).toBeLessThanOrEqual(rightPortrait.x + rightPortrait.w - inset);
      expect(R.cy).toBeGreaterThanOrEqual(rightPortrait.y + inset);
      expect(R.cy).toBeLessThanOrEqual(rightPortrait.y + rightPortrait.h - inset);
    }
    expect(leftXs.size).toBeGreaterThan(5);
    expect(leftYs.size).toBeGreaterThan(5);

    const mid = damageTextPosition('left', () => 0.5);
    expect(mid.cx).toBeCloseTo(14 + inset + (202 - 2 * inset) * 0.5, 5);
    expect(mid.cy).toBeCloseTo(131 + inset + (202 - 2 * inset) * 0.5, 5);

    const corner = damageTextPosition('left', () => 0);
    expect(corner.cx).toBe(14 + inset);
    expect(corner.cy).toBe(131 + inset);
  });

  it('ignores hit effects when damage is zero or ghost is below current hp', async () => {
    const plain = await renderBattleCardPng({
      left: { ...GOLDEN_LEFT, winner: false, streak: 0, hp: 60 },
      right: { ...GOLDEN_RIGHT, down: false, hp: 45 },
    });
    const noop = await renderBattleCardPng({
      left: { ...GOLDEN_LEFT, winner: false, streak: 0, hp: 60 },
      right: { ...GOLDEN_RIGHT, down: false, hp: 45, hpGhost: 20, damage: 0 },
    });
    expect(noop.equals(plain)).toBe(true);
  });

  it('renders long names and three digit stats', async () => {
    const png = await renderBattleCardPng({
      left: { ...GOLDEN_LEFT, name: 'CokUzunBirKullaniciAdi', atk: 387, def: 329, spd: 290, crt: 62 },
      right: { ...GOLDEN_RIGHT, name: 'Buzgeçit Efendisi', atk: 305, def: 189, spd: 211 },
    });
    expect(png.length).toBeGreaterThan(500);
  });
});
