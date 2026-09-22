import { describe, expect, it } from 'vitest';
import {
  pickBattleWinner,
  runPvpBattleExchanges,
  type PvpBattlerState,
} from '../systems/pvp';

function makeBattler(id: string, overrides: Partial<PvpBattlerState> = {}): PvpBattlerState {
  return {
    playerId: id,
    hp: 800,
    hpMax: 800,
    stamina: 100,
    power: 55,
    buffDamageMult: 1,
    buffDodgeBonus: 0,
    ...overrides,
  };
}

function runAndPick(challenger: PvpBattlerState, defender: PvpBattlerState): string {
  runPvpBattleExchanges(challenger, defender);
  return pickBattleWinner(challenger, defender).playerId;
}

describe('PvP power-weighted outcome', () => {
  it('knocked-out battler loses even when higher power', () => {
    const challenger = makeBattler('challenger', { power: 40, hp: 39, hpMax: 100 });
    const defender = makeBattler('defender', { power: 70, hp: 0, hpMax: 100 });
    expect(pickBattleWinner(challenger, defender).playerId).toBe('challenger');
  });

  it('higher power wins even with less remaining HP', () => {
    const strong = makeBattler('strong', { power: 250, hp: 40, hpMax: 400 });
    const weak = makeBattler('weak', { power: 180, hp: 60, hpMax: 400 });
    expect(pickBattleWinner(strong, weak).playerId).toBe('strong');
    expect(pickBattleWinner(weak, strong).playerId).toBe('strong');
  });

  it('after full fight higher power battler wins', () => {
    const challenger = makeBattler('challenger', { power: 250 });
    const defender = makeBattler('defender', { power: 180 });
    runPvpBattleExchanges(challenger, defender);
    expect(pickBattleWinner(challenger, defender).playerId).toBe('challenger');
  });

  it('equal power fights are deterministic (same input → same winner)', () => {
    const results = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      const c = makeBattler('challenger', { power: 50 });
      const d = makeBattler('defender', { power: 50 });
      results.add(runAndPick(c, d));
    }
    expect(results.size).toBe(1);
  });

  it('stronger battler strikes first in exchange 1', () => {
    const challenger = makeBattler('challenger', { power: 70 });
    const defender = makeBattler('defender', { power: 40 });
    const { turnEvents } = runPvpBattleExchanges(challenger, defender);
    expect(turnEvents[0]?.attackerId).toBe('challenger');

    const swapped = makeBattler('challenger', { power: 40 });
    const strongerDef = makeBattler('defender', { power: 70 });
    const { turnEvents: defFirst } = runPvpBattleExchanges(swapped, strongerDef);
    expect(defFirst[0]?.attackerId).toBe('defender');
  });

  it('pickBattleWinner uses hpMax tiebreak when remaining HP and power are equal', () => {
    const challenger = makeBattler('challenger', { power: 50, hp: 100, hpMax: 900 });
    const defender = makeBattler('defender', { power: 50, hp: 100, hpMax: 800 });
    expect(pickBattleWinner(challenger, defender).playerId).toBe('challenger');
  });
});
