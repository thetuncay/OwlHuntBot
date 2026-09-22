import { describe, it, expect } from 'vitest';
import { PREY } from '../config';
import { renderEmoji } from '../config/custom-emojis';
import { buildZooText, buildFullZooText } from '../utils/zoo-ux';
import type { PreyDexRow } from '../systems/prey-dex';

function makeRows(overrides: Partial<Record<string, Partial<PreyDexRow>>>): PreyDexRow[] {
  return PREY.map((p) => ({
    preyName: p.name,
    discovered: false,
    totalCaught: 0,
    inventoryQty: 0,
    ...overrides[p.name],
  }));
}

const UNKNOWN = renderEmoji('ui.soru', '❓');

describe('zoo-ux', () => {
  it('discovered prey shows emoji even when inventory is 0', () => {
    const text = buildZooText({
      username: 'Test',
      helpPrefix: 'w',
      rows: makeRows({
        fare: { discovered: true, totalCaught: 5, inventoryQty: 0 },
      }),
    });
    expect(text).toContain(`**Keşfedilen 1/${PREY.length}**`);
    expect(text).toContain(UNKNOWN);
    expect(text).not.toMatch(/\*\*fare\*\*/);
    expect(text.startsWith('**🌿')).toBe(true);
  });

  it('undiscovered prey uses custom soru emoji', () => {
    const text = buildZooText({
      username: 'Test',
      helpPrefix: 'w',
      rows: makeRows({}),
    });
    const escaped = UNKNOWN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const unknownCount = (text.match(new RegExp(escaped, 'g')) ?? []).length;
    expect(unknownCount).toBe(PREY.length);
    expect(UNKNOWN === '❓' || UNKNOWN.includes('soru')).toBe(true);
  });

  it('shows inventory count in grid for discovered prey', () => {
    const text = buildZooText({
      username: 'Test',
      helpPrefix: 'w',
      rows: makeRows({
        fare: { discovered: true, totalCaught: 3, inventoryQty: 3 },
        serce: { discovered: true, totalCaught: 8, inventoryQty: 8 },
      }),
    });
    expect(text).toContain('Envanterde **11**');
    expect(text).toContain(`**Keşfedilen 2/${PREY.length}**`);
    expect(text).toContain('Toplam yakalanan 11');
    expect(text).not.toContain('w sell');
    expect(text).not.toContain('soru işareti');
    expect(text).not.toContain('????');
    expect(text).not.toContain('Göz statını');
  });

  it('owl section matches owned owls not dex-only', () => {
    const text = buildFullZooText({
      username: 'Tuncay',
      helpPrefix: 'w',
      rows: makeRows({}),
      owls: [
        {
          id: '1', species: 'A', tier: 1, moonTier: 1, quality: 'Common',
          hp: 100, hpMax: 100, isMain: true,
          statGaga: 10, statGoz: 10, statKulak: 10, statKanat: 10, statPence: 10,
        },
        {
          id: '2', species: 'B', tier: 2, moonTier: 2, quality: 'Common',
          hp: 100, hpMax: 100, isMain: false,
          statGaga: 10, statGoz: 10, statKulak: 10, statKanat: 10, statPence: 10,
        },
      ],
    });
    expect(text).toContain('Baykuş Koleksiyonu');
    expect(text).toContain('2/8 tür açıldı');
    expect(text).toContain('1-2');
  });
});
