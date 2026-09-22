import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  RUNE_DEFS,
  RUNE_DROP_GATE_FIGHT,
  RUNE_DROP_GATE_TAME,
  RUNE_RARITY_WEIGHTS,
  runeBonusesToStatDeltas,
  runeRarityWeightMult,
} from '../config/runes';
import { resolveRuneDef } from '../systems/runes';
import {
  buildRuneCatalogEmbed,
  buildRuneInventoryText,
  formatRuneDropLine,
  formatRuneBonusLine,
  renderRuneEmoji,
} from '../utils/rune-ux';
import { BUFF_ITEMS, HUNT_ITEM_DROPS, OWL_TRAITS, DISMANTLE_TABLE } from '../config';
import { foldTrAscii } from '../utils/alias-command';
import { ALIASES, resolveOwlSubcommand } from '../commands/owl-utils';
import { resetApplicationEmojiHydrateForTests } from '../config/emoji-runtime';

vi.mock('../utils/lock', () => ({
  withLock: (_id: string, _action: string, fn: () => Promise<unknown>) => fn(),
}));

vi.mock('../state/player-state', () => ({
  addInventoryItemInRedis: vi.fn(),
  applyOwlStatUpdate: vi.fn(),
  applyInventoryQuantityInRedis: vi.fn(),
}));

import { applyRuneToMain } from '../systems/runes';
import { applyOwlStatUpdate, applyInventoryQuantityInRedis } from '../state/player-state';

describe('runes config', () => {
  it('9 taş ID 040–048', () => {
    expect(RUNE_DEFS).toHaveLength(9);
    expect(RUNE_DEFS.map((d) => d.id)).toEqual([
      '040', '041', '042', '043', '044', '045', '046', '047', '048',
    ]);
  });

  it('gate ve rarity ağırlıkları configte', () => {
    expect(RUNE_DROP_GATE_TAME).toBe(0.08);
    expect(RUNE_DROP_GATE_FIGHT).toBe(0.1);
    const sum = Object.values(RUNE_RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
    expect(RUNE_RARITY_WEIGHTS.Yaygın).toBeGreaterThan(RUNE_RARITY_WEIGHTS.Ender);
    expect(RUNE_RARITY_WEIGHTS.Efsanevi).toBe(1);
  });

  it('ATK/DEF/SPD/CRT → pençe/gaga/kanat/göz', () => {
    expect(runeBonusesToStatDeltas({ ATK: 4 })).toEqual({ pence: 4 });
    expect(runeBonusesToStatDeltas({ DEF: 2, SPD: 3 })).toEqual({ gaga: 2, kanat: 3 });
    expect(runeBonusesToStatDeltas({ CRT: 5 })).toEqual({ goz: 5 });
    expect(runeBonusesToStatDeltas({ ATK: 1, DEF: 1, SPD: 1, CRT: 1 })).toEqual({
      pence: 1,
      gaga: 1,
      kanat: 1,
      goz: 1,
    });
  });

  it('güçlü düşmanda efsanevi çarpanı artar, zayıfta düşer', () => {
    const strong = runeRarityWeightMult(2, 'God Roll');
    const weak = runeRarityWeightMult(7, 'Trash');
    expect(strong.Efsanevi).toBeGreaterThan(weak.Efsanevi);
    expect(weak.Yaygın).toBeGreaterThan(strong.Yaygın);
  });

  it('isimler buff / trait / materyal ile çakışmaz', () => {
    const runeNames = new Set(RUNE_DEFS.map((d) => d.name));
    for (const b of BUFF_ITEMS) {
      expect(runeNames.has(b.name), `buff çakışması: ${b.name}`).toBe(false);
    }
    for (const t of OWL_TRAITS) {
      const plain = t.name.replace(/^[^\s]+\s/, '');
      expect(runeNames.has(plain), `trait çakışması: ${plain}`).toBe(false);
      expect(runeNames.has(t.name), `trait çakışması: ${t.name}`).toBe(false);
    }
    for (const d of HUNT_ITEM_DROPS) {
      expect(runeNames.has(d.itemName), `materyal çakışması: ${d.itemName}`).toBe(false);
    }
    for (const rows of Object.values(DISMANTLE_TABLE)) {
      for (const r of rows) {
        expect(runeNames.has(r.itemName), `dismantle çakışması: ${r.itemName}`).toBe(false);
      }
    }
    expect(runeNames.has('Tüy Parçası')).toBe(false);
    expect(runeNames.has('Sessiz Kanat')).toBe(false);
    expect(runeNames.has('Orman Ruhu')).toBe(false);
  });
});

describe('rune resolve / UX', () => {
  it('ID ve isimle çözümler', () => {
    expect(resolveRuneDef('040')?.name).toBe('Büyülü Tüy');
    expect(resolveRuneDef('40')?.name).toBe('Büyülü Tüy');
    expect(resolveRuneDef('Hiçlik Özü')?.id).toBe('048');
    expect(resolveRuneDef('yok')).toBeNull();
  });

  it('drop satırı formatı', () => {
    const def = RUNE_DEFS[0]!;
    expect(formatRuneDropLine(def)).toMatch(/\*\*Büyülü Tüy\*\* düştü!$/);
    expect(formatRuneBonusLine(def.bonuses)).toContain('+3 Kanat');
    expect(formatRuneBonusLine(def.bonuses)).toContain('+2 Gaga');
  });

  it('liste: tüm ID’ler + her satırda rün emojisi', () => {
    resetApplicationEmojiHydrateForTests();
    const owned = [{ def: RUNE_DEFS[0]!, quantity: 3 }];
    const text = buildRuneInventoryText(owned, 2, 'w');
    expect(text).toContain('**RÜN**');
    expect(text).toContain('Main +2');
    for (const def of RUNE_DEFS) {
      expect(text).toContain(`\`${def.id}\``);
      expect(text).toContain(`**${def.name}**`);
      expect(text).toContain(renderRuneEmoji(def));
    }
    expect(text).toContain('×3');
    expect(text).toContain('×0');
    expect(text).toContain('↳');
    expect(text).toContain('`w rün 040`');
  });

  it('katalog rarity alanı var', () => {
    resetApplicationEmojiHydrateForTests();
    const json = buildRuneCatalogEmbed('w').toJSON();
    const names = (json.fields ?? []).map((f) => f.name ?? '');
    expect(names.some((n) => n.includes('Yaygın'))).toBe(true);
    expect(names.some((n) => n.includes('Efsanevi'))).toBe(true);
  });
});

describe('rune aliases', () => {
  it('rün / run / rune → run', () => {
    expect(foldTrAscii('rün')).toBe('run');
    expect(resolveOwlSubcommand('rün')).toBe('run');
    expect(resolveOwlSubcommand('run')).toBe('run');
    expect(ALIASES.rune).toBe('run');
  });
});

describe('applyRuneToMain — kesin (fail RNG yok)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('envanterden düşer, trained artar, count incr', async () => {
    const main = {
      id: 'owl-1',
      ownerId: 'p1',
      isMain: true,
      statGagaBase: 10,
      statGozBase: 10,
      statKulakBase: 10,
      statKanatBase: 10,
      statPenceBase: 10,
      statGagaTrained: 0,
      statGozTrained: 0,
      statKulakTrained: 0,
      statKanatTrained: 0,
      statPenceTrained: 0,
      statGaga: 10,
      statGoz: 10,
      statKulak: 10,
      statKanat: 10,
      statPence: 10,
    };

    const redis = {
      incr: vi.fn().mockResolvedValue(3),
      expire: vi.fn().mockResolvedValue(1),
      get: vi.fn(),
    };

    let owlUpdate: Record<string, number> | null = null;
    const prisma = {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          inventoryItem: {
            findUnique: vi.fn().mockResolvedValue({
              quantity: 2,
              itemType: 'Rün',
              itemName: 'Kırık Taş',
            }),
            update: vi.fn().mockResolvedValue({}),
            delete: vi.fn(),
          },
          owl: {
            findFirst: vi.fn().mockResolvedValue(main),
            update: vi.fn().mockImplementation(({ data }: { data: Record<string, number> }) => {
              owlUpdate = data;
              return Promise.resolve({});
            }),
          },
          auditLog: { create: vi.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      }),
    };

    const result = await applyRuneToMain(
      prisma as never,
      redis as never,
      'p1',
      '041',
    );

    expect(result.def.name).toBe('Kırık Taş');
    expect(result.appliedCount).toBe(3);
    expect(owlUpdate?.statPenceTrained).toBe(4);
    expect(owlUpdate?.statPence).toBe(14);
    expect(applyInventoryQuantityInRedis).toHaveBeenCalled();
    expect(applyOwlStatUpdate).toHaveBeenCalled();
    expect(redis.incr).toHaveBeenCalled();
  });
});
