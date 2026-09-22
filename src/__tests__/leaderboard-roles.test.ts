import { describe, expect, it } from 'vitest';
import {
  ROLE_DEFINITIONS,
  formatRoleStealAnnouncement,
  planLeaderboardRolePositions,
  resolveLeaderboardRoleHolder,
  buildRoleStealEmbed,
} from '../systems/roles';
import type { LeaderboardEntry } from '../systems/leaderboard-types';

describe('ROLE_DEFINITIONS', () => {
  it('has exactly three top roles', () => {
    expect(ROLE_DEFINITIONS).toHaveLength(3);
    expect(ROLE_DEFINITIONS.map((d) => d.name)).toEqual([
      'Altın Baronu 💰',
      'Arenanın babası ⚔️',
      '👑 İmparator',
    ]);
  });

  it('covers power arena wealth only', () => {
    const categories = ROLE_DEFINITIONS.map((d) => d.category).sort();
    expect(categories).toEqual(['arena', 'power', 'wealth']);
  });

  it('orders emperor above arena above wealth', () => {
    const emperor = ROLE_DEFINITIONS.find((d) => d.key === 'POWER_1')!;
    const arena = ROLE_DEFINITIONS.find((d) => d.key === 'ARENA_1')!;
    const wealth = ROLE_DEFINITIONS.find((d) => d.key === 'WEALTH_1')!;
    expect(emperor.stackOrder).toBeGreaterThan(arena.stackOrder);
    expect(arena.stackOrder).toBeGreaterThan(wealth.stackOrder);
  });
});

describe('planLeaderboardRolePositions', () => {
  it('stacks roles directly under bot role', () => {
    const roles = [...ROLE_DEFINITIONS]
      .sort((a, b) => a.stackOrder - b.stackOrder)
      .map((d) => ({ key: d.key, name: d.name }));

    const plan = planLeaderboardRolePositions(50, roles);
    expect(plan).toEqual([
      { roleKey: 'WEALTH_1', roleName: 'Altın Baronu 💰', targetPosition: 47 },
      { roleKey: 'ARENA_1', roleName: 'Arenanın babası ⚔️', targetPosition: 48 },
      { roleKey: 'POWER_1', roleName: '👑 İmparator', targetPosition: 49 },
    ]);
  });

  it('returns empty when bot role is too low', () => {
    expect(planLeaderboardRolePositions(1, [{ key: 'POWER_1', name: 'x' }])).toEqual([]);
  });
});

describe('resolveLeaderboardRoleHolder', () => {
  const entry = (playerId: string, score: number, rank: number): LeaderboardEntry => ({
    playerId,
    score,
    rank,
    displayName: playerId,
    level: 1,
    detail: String(score),
  });

  it('keeps incumbent when top players are tied', () => {
    const entries = [
      entry('quaxyn', 5000, 1),
      entry('kifoz', 5000, 2),
    ];
    expect(resolveLeaderboardRoleHolder(entries, 'kifoz')).toBe('kifoz');
    expect(resolveLeaderboardRoleHolder(entries, 'quaxyn')).toBe('quaxyn');
  });

  it('uses stable playerId order on first tie without incumbent', () => {
    const entries = [
      entry('quaxyn', 5000, 1),
      entry('kifoz', 5000, 2),
    ];
    expect(resolveLeaderboardRoleHolder(entries, null)).toBe('kifoz');
  });

  it('switches holder when leader has strictly higher score', () => {
    const entries = [
      entry('quaxyn', 5001, 1),
      entry('kifoz', 5000, 2),
    ];
    expect(resolveLeaderboardRoleHolder(entries, 'kifoz')).toBe('quaxyn');
  });
});

const sampleStealEvent = {
  roleKey: 'POWER_1',
  roleId: 'role-power',
  roleName: '👑 İmparator',
  category: 'power' as const,
  scoreLabel: 'Güç Puanı',
  newHolderId: 'new',
  newHolderName: 'Kifoz',
  newScore: 12_450,
  newDetail: 'Lv.42 · 18.200 XP',
  oldHolderId: 'old',
  oldHolderName: 'Tuncay',
  oldScore: 12_100,
  oldDetail: 'Lv.41 · 17.900 XP',
};

describe('formatRoleStealAnnouncement', () => {
  it('formats steal line with role mention', () => {
    const text = formatRoleStealAnnouncement(sampleStealEvent);
    expect(text).toBe(
      '<@&role-power> → <@new> **👑 İmparator** tacını <@old> oyuncusundan kaptı!',
    );
  });
});

describe('buildRoleStealEmbed', () => {
  it('uses category headline, role mention and scores', () => {
    const embed = buildRoleStealEmbed(sampleStealEvent);
    const json = embed.toJSON();
    expect(json.title).toBe('👑İMPARATOR TAHTI EL DEĞİŞTİ');
    expect(json.color).toBe(0xf1c40f);
    expect(json.description).toContain('<@&role-power>');
    expect(json.description).toContain('Kifoz');
    expect(json.description).toContain('tahtı devraldı');
    expect(json.fields?.[0]?.name).toBe('🏆 Yeni #1');
    expect(json.fields?.[0]?.value).toContain('12.450');
    expect(json.fields?.[2]?.value).toContain('+350');
  });
});
