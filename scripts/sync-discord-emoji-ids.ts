#!/usr/bin/env npx tsx
/**
 * Discord Developer Portal emoji ID'lerini çeker ve config dosyalarını günceller.
 *
 * Kullanım:
 *   npx tsx scripts/sync-discord-emoji-ids.ts
 *   npx tsx scripts/sync-discord-emoji-ids.ts --prefix owl_7_
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_ID = process.env.CLIENT_ID?.trim();
const TOKEN = process.env.DISCORD_TOKEN?.trim();
const prefixArg = process.argv.find((a) => a.startsWith('--prefix='))?.slice('--prefix='.length)
  ?? (process.argv.includes('--prefix') ? process.argv[process.argv.indexOf('--prefix') + 1] : undefined);

if (!CLIENT_ID || !TOKEN) {
  console.error('CLIENT_ID ve DISCORD_TOKEN gerekli (.env)');
  process.exit(1);
}

interface DiscordEmoji { id: string; name: string; animated?: boolean; }

async function fetchEmojis(): Promise<DiscordEmoji[]> {
  const res = await fetch(`https://discord.com/api/v10/applications/${CLIENT_ID}/emojis`, {
    headers: { Authorization: `Bot ${TOKEN}` },
  });
  if (!res.ok) {
    console.error('Discord API hata:', res.status, await res.text());
    process.exit(1);
  }
  const data = await res.json() as DiscordEmoji[] | { items: DiscordEmoji[] };
  return Array.isArray(data) ? data : data.items;
}

function isMoonOrOwl(name: string): boolean {
  return name.startsWith('moon_') || /^owl_\d+_t/.test(name) || name === 'owl_8_t31';
}

const UI_EMOJI_NAMES = new Set([
  'paracantasi', 'xpyildiz',
  'yaygin', 'ender', 'nadir', 'efsanevi', 'soru',
]);
const RUNE_EMOJI_NAMES = new Set([
  'tuyparcasi', 'kiriktas', 'sessizkanat', 'ormanruhu',
  'gecenefesi', 'sonnefes', 'altintotem', 'kadim_yumurta', 'hiclikozu',
]);
const EXTENDED_PREY_NAMES = new Set([
  // Kısa Discord isimleri (owl_prey_* kaldırıldı)
  'fare', 'serce', 'kurbaga', 'kertenkele', 'hamster', 'kostebek', 'yarasa',
  'bildircin', 'guvercin', 'yilan', 'sincap', 'tavsan', 'gelincik', 'kirpi',
  'yabankedi', 'kaz', 'keci', 'kunduz', 'koyun', 'tilki', 'sansar', 'kurt',
  // Portal’da ekstra / ileride
  'ayi', 'bukelemun', 'kaplumbaga', 'horoz', 'panda', 'penguen', 'yengec', 'yusufcuk',
]);

function isEntity(name: string): boolean {
  return name.startsWith('owl_prey_')
    || name.startsWith('owl_buff_')
    || name.startsWith('owl_item_')
    || name.startsWith('owl_loot_')
    || UI_EMOJI_NAMES.has(name)
    || RUNE_EMOJI_NAMES.has(name)
    || EXTENDED_PREY_NAMES.has(name);
}

const GAMBLE_EMOJI_NAMES = new Set(['SlotsRolling', 'CoinSpin', 'diamond', 'coin', 'image']);

function isGamble(name: string): boolean {
  return GAMBLE_EMOJI_NAMES.has(name);
}

function formatEntry(name: string, id: string, animated: boolean): string {
  return `  "${name}": { name: "${name}", id: "${id}", animated: ${animated} },`;
}

function patchOwlEvolution(emojis: DiscordEmoji[]): void {
  const path = resolve(ROOT, 'src/config/owl-evolution-emoji-ids.ts');
  let src = readFileSync(path, 'utf8');
  const targets = emojis
    .filter((e) => isMoonOrOwl(e.name))
    .filter((e) => !prefixArg || e.name.startsWith(prefixArg))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const e of targets) {
    const re = new RegExp(`"${e.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}": \\{ name: "[^"]+", id: "[^"]+", animated: (true|false) \\}`);
    if (!re.test(src)) {
      console.warn('owl-evolution dosyasında bulunamadı:', e.name);
      continue;
    }
    src = src.replace(re, `"${e.name}": { name: "${e.name}", id: "${e.id}", animated: ${!!e.animated} }`);
    console.log('owl-evolution:', e.name, '→', e.id);
  }
  writeFileSync(path, src);
}

function rewriteEntityFile(emojis: DiscordEmoji[]): void {
  const path = resolve(ROOT, 'src/config/game-entity-emoji-ids.ts');
  const targets = emojis.filter((e) => isEntity(e.name)).sort((a, b) => a.name.localeCompare(b.name));
  const body = targets.map((e) => formatEntry(e.name, e.id, !!e.animated)).join('\n');
  const src = `/** Discord application emoji ID'leri — av, buff, materyal, lootbox, rün (API sync). */
export interface GameEntityEmojiEntry {
  name: string;
  id: string;
  animated: boolean;
}

export const GAME_ENTITY_EMOJI_BY_NAME: Record<string, GameEntityEmojiEntry> = {
${body}
};
`;
  writeFileSync(path, src);
  console.log('game-entity-emoji-ids.ts yenilendi:', targets.length, 'emoji');
  const expected = [
    ...UI_EMOJI_NAMES,
    ...RUNE_EMOJI_NAMES,
    ...EXTENDED_PREY_NAMES,
  ];
  const have = new Set(targets.map((e) => e.name));
  for (const name of expected) {
    if (!have.has(name)) console.warn('[sync] Discord uygulamasında YOK (upload et):', name);
  }
}

function rewriteGambleFile(emojis: DiscordEmoji[]): void {
  const path = resolve(ROOT, 'src/config/gamble-emoji-ids.ts');
  const targets = emojis.filter((e) => isGamble(e.name)).sort((a, b) => a.name.localeCompare(b.name));
  const body = targets.map((e) => formatEntry(e.name, e.id, !!e.animated)).join('\n');
  const src = `/** Discord application emoji ID'leri — slot, coinflip animasyonları. */
export interface GambleEmojiEntry {
  name: string;
  id: string;
  animated: boolean;
}

export const GAMBLE_EMOJI_BY_NAME: Record<string, GambleEmojiEntry> = {
${body}
};
`;
  writeFileSync(path, src);
  console.log('gamble-emoji-ids.ts yenilendi:', targets.length, 'emoji');
}

async function main(): Promise<void> {
  const emojis = await fetchEmojis();
  console.log('Discord emoji sayısı:', emojis.length);
  if (prefixArg) {
    patchOwlEvolution(emojis);
    return;
  }
  patchOwlEvolution(emojis);
  rewriteEntityFile(emojis);
  rewriteGambleFile(emojis);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
