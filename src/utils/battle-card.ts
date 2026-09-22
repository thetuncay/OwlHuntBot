/**
 * Düello kartı — referans tasarımın birebir yeniden üretimi.
 *
 * Tüm geometri sabit bir 1280x504 tasarım uzayında tanımlıdır. Çıktı, SVG
 * viewBox üzerinden tek bir ölçekle büyütülüp küçültülür; hiçbir alt eleman
 * kendi başına yeniden boyutlanmaz.
 *
 * Koordinatlar referans ekran görüntüsünden piksel ölçümüyle çıkarılmıştır.
 */
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import sharp, { type OverlayOptions } from 'sharp';

export interface BattleCardFighter {
  name: string;
  hp: number;
  hpMax: number;
  energy: number;
  energyMax: number;
  atk: number;
  def: number;
  spd: number;
  crt: number;
  tier: number;
  moon: number;
  streak?: number;
  down?: boolean;
  winner?: boolean;
  acting?: boolean;
  portraitKind?: 'owl' | 'mob';
  portraitSeed?: string;
  /** Bu turdan önceki HP — barda erimekte olan "hayalet iz" olarak çizilir. */
  hpGhost?: number;
  /** Bu turda alınan hasar — portrenin üzerinde balon olarak gösterilir. */
  damage?: number;
}

export interface BattleCardInput {
  left: BattleCardFighter;
  right: BattleCardFighter;
}

/* ================================================================
 * Tasarım uzayı
 * ================================================================ */

const DESIGN_W = 1280;
const DESIGN_H = 504;

/** Kompozisyonun tamamına uygulanan tek ölçek. 1 = referans çözünürlük. */
const RENDER_SCALE = 1;

const CARD_W = Math.round(DESIGN_W * RENDER_SCALE);
const CARD_H = Math.round(DESIGN_H * RENDER_SCALE);

/* Paneller */
const PANEL_Y = 45;
const PANEL_H = 452;
const PANEL_W = 622;

/* Portre + çerçeve */
const PORTRAIT_W = 202;
const PORTRAIT_H = 202;
const PORTRAIT_Y = 131;
const FRAME_PAD = 2;
const STATUS_STRIP_H = 30;

/* Barlar */
const BAR_H = 38;
const HP_Y = 138;
const MP_Y = 182;

/* İsim + statlar */
const NAME_Y = 261;
const STAT_ROW_Y = [308, 349, 390, 430] as const;
const STAT_LABEL_DX = 0;
const STAT_VALUE_END_DX = 142;
const STAT_SQUARE_DX = 189;
const STAT_SQUARE = 18;
const STAT_SQUARE_RISE = 16;

/* Tier / Moon rozetleri */
const CHIP_W = 98;
const CHIP_H = 26;
const CHIP_GAP = 6;
const CHIP_Y = 342;

/* WIN kutusu */
const WIN_Y = 374;
const WIN_H = 30;

/* Streak (alev) rozeti */
const FLAME_W = 122;
const FLAME_H = 53;
const FLAME_Y = 72;
const FLAME_INSET = 48;
const FLAME_ICON_DX = 21;
const FLAME_ICON_W = 17;
const FLAME_ICON_H = 30;
const FLAME_TEXT_DX = 94;

/** Yön bağımlı ankraj noktaları. */
const SIDES = {
  left: { panelX: 6, barsX: 225, barW: 394, portraitX: 14, mirror: false },
  right: { panelX: 654, barsX: 666, barW: 396, portraitX: 1067, mirror: true },
} as const;

/** Portre ile stat sütunu arasındaki boşluk — sol panelden türetilir. */
const PORTRAIT_STAT_GAP = SIDES.left.barsX - (SIDES.left.portraitX + PORTRAIT_W);
const STAT_BLOCK_W = STAT_SQUARE_DX + STAT_SQUARE;

function statBaseX(align: 'left' | 'right'): number {
  const { portraitX } = SIDES[align];
  if (align === 'left') return portraitX + PORTRAIT_W + PORTRAIT_STAT_GAP;
  return portraitX - PORTRAIT_STAT_GAP - STAT_BLOCK_W;
}

/* ================================================================
 * Palet — referanstan örneklendi
 * ================================================================ */

const C_BG = '#232428';
const C_PANEL = '#232428';
const C_HP_TRACK = '#212225';
const C_MP_TRACK = '#0b1228';
const C_HP_FILL = '#c75b5b';
/** Kaybedilen HP'nin barda bıraktığı iz. */
const C_HP_GHOST = '#8a3a3e';
const C_MP_FILL = '#2e5bff';
const C_DAMAGE = '#ff5a5f';
const C_DAMAGE_EDGE = '#140609';
const C_BAR_EDGE = '#3f4451';
const C_YELLOW = '#fee75c';
const C_RED = '#bd3c40';
const C_ACT = '#f8fafc';
const C_IDLE = '#3f3f46';
const C_CHIP_FILL = '#141519';
const C_CHIP_EDGE = '#596269';
const C_CHIP_TEXT = '#eff0f0';
const C_NAME = '#ffffff';
const C_LABEL = '#c1c3c6';
const C_VALUE = '#ffffff';
const C_HP_EMPTY = '#ba3b40';
const C_DOWN_TEXT = '#b35659';
const C_FLAME_EDGE = '#eca743';
const C_FLAME = '#ff642a';

const STAT_COLORS = ['#ec4d6e', '#5b90ee', '#5ecbe6', '#f2ab3d'] as const;

/* ================================================================
 * Tipografi
 * ================================================================ */

const FS_FLAME = 38;
const FS_BAR = 22;
const FS_NAME = 32;
const FS_STAT = 33;
const FS_CHIP = 18;
const FS_STATUS = 20;
const FS_DAMAGE = 54;

/**
 * Hasar yazısı ilgili baykuş portresi (kırmızı kutu) içinde
 * rastgele konuma yerleşir — her tur farklı nokta.
 */
const DAMAGE_INSET = 32;

/** Baseline'ı kutu ortasına hizalamak için kabaca cap-height/2 payı. */
const BASELINE_SHIFT = 0.36;

const FONT_CANDIDATES_MONO = [
  join(process.cwd(), 'assets/fonts/DejaVuSansMono-Bold.ttf'),
  '/usr/share/fonts/dejavu/DejaVuSansMono-Bold.ttf',
  join(process.cwd(), 'assets/fonts/DejaVuSans-Bold.ttf'),
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
];

function firstFont(paths: string[]): string {
  return paths.find((p) => existsSync(p)) ?? '';
}

function fontFaceCss(): string {
  const mono = firstFont(FONT_CANDIDATES_MONO);
  const href = mono ? pathToFileURL(mono).href : '';
  return href ? `@font-face { font-family: CardMono; src: url('${href}'); font-weight: 700; }` : '';
}

const FONT_STACK = 'CardMono, DejaVu Sans Mono, Courier New, monospace';

function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function accent(f: BattleCardFighter): string {
  if (f.winner) return C_YELLOW;
  if (f.down) return C_RED;
  if (f.acting) return C_ACT;
  return C_IDLE;
}

function label(
  x: number,
  y: number,
  value: string,
  size: number,
  fill: string,
  anchor: 'start' | 'middle' | 'end' = 'start',
): string {
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="700"
    text-anchor="${anchor}" font-family="${FONT_STACK}">${esc(value)}</text>`;
}

/** Kutu ortasına dikey hizalanmış metin. */
function centeredText(
  cx: number,
  boxY: number,
  boxH: number,
  value: string,
  size: number,
  fill: string,
): string {
  return label(cx, boxY + boxH / 2 + size * BASELINE_SHIFT, value, size, fill, 'middle');
}

/** Referanstaki yuvarlak damla biçimli alev. */
function flameIcon(x: number, y: number, w: number, h: number): string {
  const cx = x + w / 2;
  const d = [
    `M ${cx} ${y}`,
    `C ${cx + w * 0.54} ${y + h * 0.44} ${x + w} ${y + h * 0.66} ${x + w} ${y + h * 0.72}`,
    `C ${x + w} ${y + h * 0.94} ${cx + w * 0.28} ${y + h} ${cx} ${y + h}`,
    `C ${cx - w * 0.28} ${y + h} ${x} ${y + h * 0.94} ${x} ${y + h * 0.72}`,
    `C ${x} ${y + h * 0.66} ${cx - w * 0.54} ${y + h * 0.44} ${cx} ${y}`,
    'Z',
  ].join(' ');
  return `<path d="${d}" fill="${C_FLAME}"/>`;
}

function streakBadge(panelX: number, mirror: boolean, streak: number): string {
  const x = mirror ? panelX + PANEL_W - FLAME_INSET - FLAME_W : panelX + FLAME_INSET;
  return `
    <rect x="${x}" y="${FLAME_Y}" width="${FLAME_W}" height="${FLAME_H}" rx="9"
      fill="${C_PANEL}" stroke="${C_FLAME_EDGE}" stroke-width="2"/>
    ${flameIcon(x + FLAME_ICON_DX, FLAME_Y + (FLAME_H - FLAME_ICON_H) / 2, FLAME_ICON_W, FLAME_ICON_H)}
    ${centeredText(x + FLAME_TEXT_DX, FLAME_Y, FLAME_H, String(streak), FS_FLAME, C_VALUE)}
  `;
}

function chip(x: number, value: string): string {
  return `
    <rect x="${x}" y="${CHIP_Y}" width="${CHIP_W}" height="${CHIP_H}" rx="3"
      fill="${C_CHIP_FILL}" stroke="${C_CHIP_EDGE}" stroke-width="1.5"/>
    ${centeredText(x + CHIP_W / 2, CHIP_Y, CHIP_H, value, FS_CHIP, C_CHIP_TEXT)}
  `;
}

function statusBox(x: number, y: number, w: number, h: number, kind: 'WIN' | 'DOWN'): string {
  const stroke = kind === 'WIN' ? C_YELLOW : C_RED;
  const fill = kind === 'WIN' ? C_YELLOW : C_DOWN_TEXT;
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2"
      fill="${C_PANEL}" stroke="${stroke}" stroke-width="2"/>
    ${centeredText(x + w / 2, y, h, kind, FS_STATUS, fill)}
  `;
}

function bar(
  x: number,
  y: number,
  w: number,
  ratio: number,
  track: string,
  fillColor: string,
  value: string,
  emptyRed = false,
  ghostRatio?: number,
): string {
  const pct = clamp(ratio, 0, 1);
  const innerW = Math.max(0, Math.round((w - 4) * pct));
  const textFill = emptyRed && pct <= 0 ? C_HP_EMPTY : C_VALUE;
  const ghostPct = ghostRatio == null ? pct : clamp(ghostRatio, 0, 1);
  const ghostW = ghostPct > pct ? Math.round((w - 4) * ghostPct) : 0;
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${BAR_H}" rx="2"
      fill="${track}" stroke="${C_BAR_EDGE}" stroke-width="1.5"/>
    ${ghostW > 0 ? `<rect x="${x + 2}" y="${y + 2}" width="${ghostW}" height="${BAR_H - 4}" rx="1" fill="${C_HP_GHOST}"/>` : ''}
    ${innerW > 0 ? `<rect x="${x + 2}" y="${y + 2}" width="${innerW}" height="${BAR_H - 4}" rx="1" fill="${fillColor}"/>` : ''}
    ${centeredText(x + w / 2, y, BAR_H, value, FS_BAR, textFill)}
  `;
}

/** Stat bloğu — etiket, değer ve renk göstergesi aynı satırda (her iki panelde aynı düzen). */
function statRows(statX: number, f: BattleCardFighter): string {
  const rows: Array<[string, number]> = [
    ['ATK', f.atk],
    ['DEF', f.def],
    ['SPD', f.spd],
    ['CRT', f.crt],
  ];
  return rows
    .map(([name, value], i) => {
      const y = STAT_ROW_Y[i]!;
      const color = STAT_COLORS[i]!;
      const squareX = statX + STAT_SQUARE_DX;
      return `
        ${label(statX + STAT_LABEL_DX, y, name, FS_STAT, C_LABEL, 'start')}
        ${label(statX + STAT_VALUE_END_DX, y, String(value), FS_STAT, C_VALUE, 'end')}
        <rect x="${squareX}" y="${y - STAT_SQUARE_RISE}" width="${STAT_SQUARE}"
          height="${STAT_SQUARE}" fill="${color}"/>
      `;
    })
    .join('');
}

function panelChrome(f: BattleCardFighter, align: 'left' | 'right'): string {
  const { panelX, barsX, barW, portraitX, mirror } = SIDES[align];
  const border = accent(f);
  const strokeW = f.acting && !f.winner && !f.down ? 3 : 2;
  const name = f.name.length > 18 ? `${f.name.slice(0, 17)}…` : f.name;

  const frameY = f.down ? PORTRAIT_Y - FRAME_PAD - STATUS_STRIP_H : PORTRAIT_Y - FRAME_PAD;
  const frameH = PORTRAIT_H + FRAME_PAD * 2 + (f.down ? STATUS_STRIP_H : 0);

  return `
    <rect x="${panelX}" y="${PANEL_Y}" width="${PANEL_W}" height="${PANEL_H}" rx="3"
      fill="${C_PANEL}" stroke="${border}" stroke-width="${strokeW}"/>

    <rect x="${portraitX - FRAME_PAD}" y="${frameY}" width="${PORTRAIT_W + FRAME_PAD * 2}"
      height="${frameH}" fill="#0c0c0e" stroke="${border}" stroke-width="2"/>
    ${f.down ? statusBox(portraitX, frameY + FRAME_PAD, PORTRAIT_W, STATUS_STRIP_H - FRAME_PAD, 'DOWN') : ''}
    ${f.winner ? statusBox(portraitX, WIN_Y, PORTRAIT_W, WIN_H, 'WIN') : ''}
    ${f.winner && f.streak && f.streak > 0 ? streakBadge(panelX, mirror, f.streak) : ''}

    ${chip(portraitX, `Tier ${f.tier}`)}
    ${chip(portraitX + CHIP_W + CHIP_GAP, `Moon ${f.moon}`)}

    ${bar(barsX, HP_Y, barW, f.hp / Math.max(1, f.hpMax), C_HP_TRACK, C_HP_FILL,
      `${Math.max(0, Math.round(f.hp))}/${Math.max(1, Math.round(f.hpMax))}`, true,
      f.hpGhost == null ? undefined : f.hpGhost / Math.max(1, f.hpMax))}
    ${bar(barsX, MP_Y, barW, f.energy / Math.max(1, f.energyMax), C_MP_TRACK, C_MP_FILL,
      `${Math.max(0, Math.round(f.energy))}/${Math.max(1, Math.round(f.energyMax))}`)}

    ${label(mirror ? barsX : barsX + barW, NAME_Y, name, FS_NAME, C_NAME, mirror ? 'start' : 'end')}
    ${statRows(statBaseX(align), f)}
  `;
}

/* ================================================================
 * Portre yükleme
 * ================================================================ */

function firstExisting(paths: string[]): string | null {
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return null;
}

function owlSpriteCandidates(tier: number, moon: number): string[] {
  const t = clamp(tier, 1, 8);
  let m = clamp(moon, 1, 7);
  if (t === 7 && m === 7) m = 8;
  if (t === 8 && m === 7) m = 6;
  const names = [
    `owl_${t}_t${m}_pixel.png`,
    `owl_${t}_t${m}_pixel.gif`,
    `owl_${t}_t${m}.png`,
    `owl_${t}_t${m}.gif`,
  ];
  const dirs = [
    join(process.cwd(), 'OwlBotLogos/owlhunt-all/baykuslar'),
    join(process.cwd(), 'OwlBotLogos/owlhunt-all'),
    join(process.cwd(), 'OwlBotLogos/OwlLogos'),
    join(process.cwd(), 'owlhunt/baykuslar'),
  ];
  const out: string[] = [];
  for (const dir of dirs) {
    for (const name of names) out.push(join(dir, name));
  }
  return out;
}

const MOB_DIR = join(process.cwd(), 'owlMOBS/hazır');

function pickMobPath(seed: string): string | null {
  if (!existsSync(MOB_DIR)) return null;
  const files = readdirSync(MOB_DIR).filter((f) => f.endsWith('.png'));
  if (files.length === 0) return null;
  let h = 0;
  for (const ch of seed) h = (h + ch.charCodeAt(0) * 17) % 997;
  return join(MOB_DIR, files[h % files.length]!);
}

async function loadPortraitPng(
  path: string | null,
  w: number,
  h: number,
  dim = false,
): Promise<Buffer | null> {
  if (!path) return null;
  try {
    let img = sharp(path, { animated: false, pages: 1 }).resize(w, h, {
      fit: 'cover',
      position: 'centre',
      kernel: 'nearest',
    });
    if (dim) img = img.modulate({ brightness: 0.38, saturation: 0.25 });
    return await img.png().toBuffer();
  } catch {
    return null;
  }
}

export function combatFromParts(parts: {
  gaga: number; pence: number; goz: number; kulak: number; kanat: number;
}): { atk: number; def: number; spd: number; crt: number } {
  return {
    atk: Math.max(1, Math.round(parts.gaga * 0.7 + parts.pence * 0.45)),
    def: Math.max(1, Math.round(parts.pence * 0.55 + parts.kulak * 0.4)),
    spd: Math.max(1, Math.round(parts.kanat * 0.85 + parts.goz * 0.15)),
    crt: Math.max(1, Math.min(99, Math.round(parts.goz * 0.55))),
  };
}

/**
 * Hasar balonu ankrajı — ilgili tarafın portre kutusunun içinde
 * düzgün dağılımlı rastgele nokta (merkeze kilitli jitter değil).
 * Test için `rng` enjekte edilebilir (0–1).
 *
 * @param side Sol / sağ dövüşçü
 * @param rng `Math.random` uyumlu üretici
 */
export function damageTextPosition(
  side: 'left' | 'right',
  rng: () => number = Math.random,
): { cx: number; cy: number } {
  const { portraitX } = SIDES[side];
  const minX = portraitX + DAMAGE_INSET;
  const maxX = portraitX + PORTRAIT_W - DAMAGE_INSET;
  const minY = PORTRAIT_Y + DAMAGE_INSET;
  const maxY = PORTRAIT_Y + PORTRAIT_H - DAMAGE_INSET;
  return {
    cx: minX + rng() * (maxX - minX),
    cy: minY + rng() * (maxY - minY),
  };
}

/**
 * Hasar balonları portrenin üstünde durmalı; portreler SVG tabanının üzerine
 * bindirildiği için bunlar ayrı bir saydam katman olarak en sona eklenir.
 */
function damageOverlaySvg(input: BattleCardInput): Buffer | null {
  const items: string[] = [];
  for (const [f, side] of [[input.left, 'left'], [input.right, 'right']] as const) {
    if (!f.damage || f.damage <= 0) continue;
    const { cx, cy } = damageTextPosition(side);
    const value = `-${Math.round(f.damage)}`;
    const common = `x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-size="${FS_DAMAGE}" font-weight="700"
      text-anchor="middle" font-family="${FONT_STACK}"`;
    items.push(`
      <text ${common} fill="none" stroke="${C_DAMAGE_EDGE}" stroke-width="8"
        stroke-linejoin="round">${value}</text>
      <text ${common} fill="${C_DAMAGE}">${value}</text>
    `);
  }
  if (items.length === 0) return null;
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}"
      viewBox="0 0 ${DESIGN_W} ${DESIGN_H}">
      <defs>
        <style type="text/css"><![CDATA[
          ${fontFaceCss()}
        ]]></style>
      </defs>
      ${items.join('')}
    </svg>
  `);
}

/** Referans tasarım uzayı ve gerçek çıktı boyutları. */
export const BATTLE_CARD_DIMENSIONS = {
  width: CARD_W,
  height: CARD_H,
  designWidth: DESIGN_W,
  designHeight: DESIGN_H,
  scale: RENDER_SCALE,
} as const;

export async function renderBattleCardPng(input: BattleCardInput): Promise<Buffer> {
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}"
      viewBox="0 0 ${DESIGN_W} ${DESIGN_H}">
      <defs>
        <style type="text/css"><![CDATA[
          ${fontFaceCss()}
        ]]></style>
      </defs>
      <rect width="${DESIGN_W}" height="${DESIGN_H}" fill="${C_BG}"/>
      ${panelChrome(input.left, 'left')}
      ${panelChrome(input.right, 'right')}
    </svg>
  `);

  const base = await sharp(svg).png().toBuffer();
  const overlays: OverlayOptions[] = [];
  const pw = Math.round(PORTRAIT_W * RENDER_SCALE);
  const ph = Math.round(PORTRAIT_H * RENDER_SCALE);

  for (const side of [
    { f: input.left, x: SIDES.left.portraitX },
    { f: input.right, x: SIDES.right.portraitX },
  ]) {
    const owlPath = firstExisting(owlSpriteCandidates(side.f.tier, side.f.moon));
    let portrait = await loadPortraitPng(owlPath, pw, ph, Boolean(side.f.down));
    if (!portrait) {
      portrait = await loadPortraitPng(
        pickMobPath(side.f.portraitSeed ?? side.f.name),
        pw,
        ph,
        Boolean(side.f.down),
      );
    }
    if (portrait) {
      overlays.push({
        input: portrait,
        left: Math.round(side.x * RENDER_SCALE),
        top: Math.round(PORTRAIT_Y * RENDER_SCALE),
      });
    }
  }

  const damage = damageOverlaySvg(input);
  if (damage) overlays.push({ input: damage, top: 0, left: 0 });

  return sharp(base).composite(overlays).png().toBuffer();
}
