import { describe, expect, it } from 'vitest';
import {
  buildInventoryPages,
  buildInventoryText,
  splitDiscordContent,
  DISCORD_CONTENT_LIMIT,
  type InventoryRenderData,
} from '../utils/inventory-ux';

const CUSTOM_EMOJI = '<:owl_item_kemik:1516817328564732034>';

function makeData(items: InventoryRenderData['items']): InventoryRenderData {
  return {
    username: 'quaxyn',
    items,
    activeBuffs: [],
    usedSlots: items.length,
    capacity: 98,
    page: 0,
    totalPages: 1,
    mode: 'overview',
    helpPrefix: 'w',
  };
}

describe('inventory-ux text limits', () => {
  it('hides legacy removed items from inventory text', () => {
    const text = buildInventoryText(makeData([
      { itemName: 'Yırtıcı İksiri', itemType: 'Buff', rarity: 'Common', quantity: 1 },
      { itemName: 'Keskin Nişan', itemType: 'Buff', rarity: 'Common', quantity: 2 },
    ]));
    expect(text).not.toContain('Yırtıcı İksiri');
    expect(text).not.toContain('kaldırıldı');
    expect(text).toContain('Keskin Nişan');
  });

  it('does not use "... daha" overflow lines', () => {
    const materials = [
      'Kemik Tozu', 'Parlak Tüy', 'Kırık Av Zinciri', 'Av Gözü Kristali',
      'Yırtıcı Pençe Parçası', 'Sessizlik Teli', 'Orman Yankısı', 'Gölge Tüyü',
    ].map((name, i) => ({
      itemName: name,
      itemType: 'Materyal',
      rarity: 'Common',
      quantity: 1000 + i,
    }));

    const text = buildInventoryText(makeData(materials));
    expect(text).not.toMatch(/daha/);
    expect(text).toContain('Gölge Tüyü');
  });

  it('paginates long inventories across multiple pages', () => {
    const lots = Array.from({ length: 30 }, (_, i) => ({
      itemName: ['Kemik Tozu', 'Parlak Tüy', 'Kırık Av Zinciri', 'Av Gözü Kristali'][i % 4]!,
      itemType: 'Materyal',
      rarity: 'Common',
      quantity: 500 + i,
    }));

    const pages = buildInventoryPages(makeData(lots));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((p) => p.length <= DISCORD_CONTENT_LIMIT)).toBe(true);
    expect(pages[0]).toMatch(/\(1\/\d+\)/);
  });

  it('splitDiscordContent breaks oversized messages', () => {
    const long = `${CUSTOM_EMOJI} `.repeat(120);
    const chunks = splitDiscordContent(long, 200);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 200)).toBe(true);
  });

  it('moves dismantleable prey out of inventory', () => {
    const text = buildInventoryText(makeData([
      { itemName: 'fare', itemType: 'Av', rarity: 'Common', quantity: 11 },
      { itemName: 'Kemik Tozu', itemType: 'Materyal', rarity: 'Common', quantity: 4 },
    ]));
    expect(text).not.toContain('PARÇALANABİLİR');
    expect(text).not.toContain('**fare**');
    expect(text).toContain('Kemik Tozu');
    expect(text).toContain('`w rün`');
  });

  it('keeps sell-only prey in inventory', () => {
    const text = buildInventoryText(makeData([
      { itemName: 'ejderha', itemType: 'Av', rarity: 'Rare', quantity: 2 },
    ]));
    expect(text).toContain('SATILABİLİR AVLAR');
    expect(text).toContain('**ejderha** ×2');
    expect(text).not.toContain('PARÇALANABİLİR');
  });

  it('shows owned runes where dismantleable prey used to be', () => {
    const text = buildInventoryText(makeData([
      { itemName: 'Büyülü Tüy', itemType: 'Rün', rarity: 'Common', quantity: 2 },
      { itemName: 'Kemik Tozu', itemType: 'Materyal', rarity: 'Common', quantity: 4 },
    ]));
    expect(text).toContain('**RÜNLER**');
    expect(text).toContain('`040`');
    expect(text).toContain('**Büyülü Tüy** ×2');
    expect(text.indexOf('RÜNLER')).toBeGreaterThan(text.indexOf('UPGRADE MATERYALLERİ'));
  });
});
