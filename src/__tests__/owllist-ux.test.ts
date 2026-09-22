import { describe, it, expect } from 'vitest';
import {
  buildOwllistPageRow,
  buildOwllistPageText,
  buildOwllistText,
  formatOwllistBlock,
  getOwllistPageCount,
  parseOwllistPage,
} from '../utils/owllist-ux';
import { DISCORD_MAX_CONTENT_LENGTH } from '../utils/owls-ux';
import { OWLLIST_PAGE_SIZE } from '../config';

describe('owllist-ux', () => {
  const sampleOwl = {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    species: 'Kukumav baykusu',
    tier: 8,
    moonTier: 1,
    quality: 'Common',
    hp: 100,
    hpMax: 100,
    isMain: true,
    statGaga: 20,
    statGoz: 20,
    statKulak: 20,
    statKanat: 20,
    statPence: 20,
  };

  it('formatOwllistBlock ignores stale stored moonTier when power is lower', () => {
    const lines = formatOwllistBlock({
      ...sampleOwl,
      moonTier: 5,
      statGaga: 77,
      statGoz: 75,
      statKulak: 65,
      statKanat: 82,
      statPence: 78,
    });
    expect(lines[0]).toContain('owl_8_t4');
    expect(lines[1]).toContain('moon_4_gold');
    expect(lines[1]).toContain('Güç 377');
  });

  it('formatOwllistBlock uses compact 3-line card', () => {
    const lines = formatOwllistBlock(sampleOwl);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('owl_8_t2');
    expect(lines[0]).toContain('*Kukumav baykusu*');
    expect(lines[0]).toContain('· **main**');
    expect(lines[1]).toContain('`A1B2C3D4`');
    expect(lines[1]).toContain('moon_2_half');
    expect(lines[1]).toContain('T8 · HP 100/100 · Güç 100 · Common');
    expect(lines[2]).toContain('Gaga 20');
    expect(lines[2]).toMatch(/^-# /);
  });

  it('buildOwllistText separates owl cards with blank lines', () => {
    const text = buildOwllistText({
      helpPrefix: 'w',
      owls: [
        sampleOwl,
        { ...sampleOwl, id: 'b2c3d4e5-0000-0000-0000-000000000001', isMain: false, quality: 'Trash', hp: 80, hpMax: 80 },
      ],
    });
    expect(text).toContain('Baykuşların (2)');
    expect(text).toContain('`A1B2C3D4`');
    expect(text).toContain('`B2C3D4E5`');
    expect(text).toMatch(/\n\n.*`B2C3D4E5`/s);
    expect(text).toContain('`w owls`');
    expect(text).toContain('`w setmain <id>`');
  });

  it('paginates owls with page header and button row', () => {
    const owls = Array.from({ length: OWLLIST_PAGE_SIZE + 2 }, (_, i) => ({
      ...sampleOwl,
      id: `${i.toString(16).padStart(8, '0')}-0000-0000-0000-000000000000`,
      isMain: i === 0,
    }));
    expect(getOwllistPageCount(owls.length)).toBe(2);

    const page1 = buildOwllistPageText({ helpPrefix: 'w', owls }, 1);
    expect(page1).toContain('sayfa 1/2');
    expect(page1).not.toContain('◀ `w owllist');

    const row1 = buildOwllistPageRow(1, 2);
    expect(row1?.components).toHaveLength(2);
    expect(row1?.components[0]?.data.disabled).toBe(true);
    expect(row1?.components[1]?.data.disabled).toBe(false);

    const row2 = buildOwllistPageRow(2, 2);
    expect(row2?.components[0]?.data.disabled).toBe(false);
    expect(row2?.components[1]?.data.disabled).toBe(true);
  });

  it('parseOwllistPage clamps invalid values', () => {
    expect(parseOwllistPage(undefined, 3)).toBe(1);
    expect(parseOwllistPage('abc', 3)).toBe(1);
    expect(parseOwllistPage('2', 3)).toBe(2);
    expect(parseOwllistPage('99', 3)).toBe(3);
  });

  it('buildOwllistPageText respects Discord length limit', () => {
    const owls = Array.from({ length: 40 }, (_, i) => ({
      ...sampleOwl,
      id: `${i.toString(16).padStart(8, '0')}-0000-0000-0000-000000000000`,
      isMain: i === 0,
    }));
    const totalPages = getOwllistPageCount(owls.length);
    for (let page = 1; page <= totalPages; page++) {
      const text = buildOwllistPageText({ helpPrefix: 'w', owls }, page);
      expect(text.length).toBeLessThanOrEqual(DISCORD_MAX_CONTENT_LENGTH);
    }
  });
});
