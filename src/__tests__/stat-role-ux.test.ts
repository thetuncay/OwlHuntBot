import { describe, it, expect } from 'vitest';
import { buildOwlStatsEmbed } from '../utils/stats-ux';
import { buildUpgradeOverview, buildUpgradePanel } from '../utils/upgrade-ux';
import { STAT_ROLE } from '../utils/stat-role-ux';

const sampleOwl = {
  species: 'Test',
  tier: 1,
  quality: 'Common',
  hp: 100,
  hpMax: 100,
  staminaCur: 80,
  statGaga: 20,
  statGoz: 18,
  statKulak: 16,
  statKanat: 22,
  statPence: 24,
  bond: 10,
  isMain: true,
};

describe('stat-role-ux surfacing', () => {
  it('stats embed shows subtle role hints per stat', () => {
    const embed = buildOwlStatsEmbed(sampleOwl, { level: 5 });
    const fields = embed.data.fields ?? [];
    const attack = fields.find((f) => f.name === '⚔️ Saldırı')?.value ?? '';
    expect(attack).toContain(STAT_ROLE.pence);
    expect(attack).toContain(STAT_ROLE.gaga);
    const perf = fields.find((f) => f.name === '📈 Performans')?.value ?? '';
    expect(perf).toContain('Gaga+Pençe');
    expect(embed.data.footer?.text).toContain('Pençe→yakala');
  });

  it('upgrade panel shows selected stat role when open', () => {
    const embed = buildUpgradePanel({
      owlName: 'Test',
      owlQuality: 'Common',
      stat: 'goz',
      statTrained: 3,
      statEffective: 18,
      coinCost: 100,
      coinDiscountPct: 0,
      materialCost: 3,
      materialName: 'Av Gözü Kristali',
      allStatsEffective: { gaga: 20, pence: 24, goz: 18, kulak: 16, kanat: 22 },
      depCheck: { ok: true, dependsOn: null, required: 0, current: 0, gap: 0, suggestion: null },
    }, 'w');
    expect(embed.data.description).toContain(STAT_ROLE.goz);
    expect(embed.data.footer?.text).toContain(STAT_ROLE.goz);
  });

  it('upgrade overview lists stat roles inline', () => {
    const embed = buildUpgradeOverview('w');
    const desc = embed.data.description ?? '';
    expect(desc).toContain(STAT_ROLE.pence);
    expect(desc).toContain(STAT_ROLE.kanat);
  });
});
