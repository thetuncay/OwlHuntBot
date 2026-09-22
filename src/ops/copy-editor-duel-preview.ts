/**
 * Copy Editor — örnek düello kartı PNG (panel önizlemesi).
 */
import type { ServerResponse } from 'node:http';
import { combatFromParts, renderBattleCardPng } from '../utils/battle-card';
import { SAMPLE_OPPONENT, SAMPLE_PLAYER } from '../config/copy-preview-samples';

let cachedPng: Buffer | null = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

export async function serveDuelCardPreview(res: ServerResponse): Promise<void> {
  const now = Date.now();
  if (!cachedPng || now - cachedAt > CACHE_MS) {
    cachedPng = await renderBattleCardPng({
      left: {
        name: SAMPLE_PLAYER,
        hp: 23,
        hpMax: 100,
        energy: 76,
        energyMax: 100,
        ...combatFromParts({ gaga: 13, pence: 10, goz: 6, kulak: 10, kanat: 11 }),
        tier: 8,
        moon: 1,
        streak: 2,
        winner: true,
      },
      right: {
        name: 'Ateş Rüyası',
        hp: 0,
        hpMax: 88,
        energy: 69,
        energyMax: 100,
        atk: 13,
        def: 9,
        spd: 8,
        crt: 66,
        tier: 3,
        moon: 1,
        down: true,
      },
    });
    cachedAt = now;
  }
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=60',
  });
  res.end(cachedPng);
}
