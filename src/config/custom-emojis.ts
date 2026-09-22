/**
 * Oyun varlık emojileri — baykuş evrim, item, av, lootbox, buff.
 */
import { GAME_ENTITY_EMOJI_BY_NAME } from './game-entity-emoji-ids';
import { OWL_EVOLUTION_EMOJI_BY_NAME } from './owl-evolution-emoji-ids';
import { getLiveApplicationEmoji, isApplicationEmojiHydrated } from './emoji-runtime';

export interface EmojiRef {
  key: string;
  name: string;
  animated: boolean;
  fallback: string;
  envVar: string;
}

const MOON_DEFS: EmojiRef[] = [
  { key: 'moon.m1', name: 'moon_1_quarter', animated: false, fallback: '🌑', envVar: 'EMOJI_MOON_M1' },
  { key: 'moon.m2', name: 'moon_2_half', animated: false, fallback: '🌒', envVar: 'EMOJI_MOON_M2' },
  { key: 'moon.m3', name: 'moon_3_full', animated: true, fallback: '🌓', envVar: 'EMOJI_MOON_M3' },
  { key: 'moon.m4', name: 'moon_4_gold', animated: true, fallback: '🌔', envVar: 'EMOJI_MOON_M4' },
  { key: 'moon.m5', name: 'moon_5_blood', animated: true, fallback: '🌕', envVar: 'EMOJI_MOON_M5' },
  { key: 'moon.m6', name: 'moon_6_gem', animated: true, fallback: '🌟', envVar: 'EMOJI_MOON_M6' },
  { key: 'moon.m7', name: 'moon_7_super', animated: true, fallback: '🌌', envVar: 'EMOJI_MOON_M7' },
];

function buildOwlMoonDefs(): EmojiRef[] {
  const out: EmojiRef[] = [];
  for (let species = 1; species <= 8; species++) {
    for (let stage = 1; stage <= 7; stage++) {
      let name = `owl_${species}_t${stage}`;
      if (species === 7 && stage === 7) name = 'owl_7_t8';
      if (species === 8 && stage === 7) name = 'owl_8_t6';
      out.push({
        key: `owl.s${species}.t${stage}`,
        name,
        animated: stage >= 2,
        fallback: '🦉',
        envVar: `EMOJI_OWL_S${species}_T${stage}`,
      });
    }
  }
  return out;
}

const OWL_MOON_DEFS = buildOwlMoonDefs();

const entityDefs: EmojiRef[] = [
  // Avlanabilirler — Discord name = kısa isim (API sync)
  { key: 'prey.fare', name: 'fare', animated: false, fallback: '🐭', envVar: 'EMOJI_PREY_FARE' },
  { key: 'prey.serce', name: 'serce', animated: false, fallback: '🐦', envVar: 'EMOJI_PREY_SERCE' },
  { key: 'prey.kurbaga', name: 'kurbaga', animated: false, fallback: '🐸', envVar: 'EMOJI_PREY_KURBAGA' },
  { key: 'prey.kertenkele', name: 'kertenkele', animated: false, fallback: '🦎', envVar: 'EMOJI_PREY_KERTENKELE' },
  { key: 'prey.hamster', name: 'hamster', animated: false, fallback: '🐹', envVar: 'EMOJI_PREY_HAMSTER' },
  { key: 'prey.kostebek', name: 'kostebek', animated: false, fallback: '🐀', envVar: 'EMOJI_PREY_KOSTEBEK' },
  { key: 'prey.yarasa', name: 'yarasa', animated: false, fallback: '🦇', envVar: 'EMOJI_PREY_YARASA' },
  { key: 'prey.bildircin', name: 'bildircin', animated: false, fallback: '🐤', envVar: 'EMOJI_PREY_BILDIRCIN' },
  { key: 'prey.guvercin', name: 'guvercin', animated: false, fallback: '🕊️', envVar: 'EMOJI_PREY_GUVERCIN' },
  { key: 'prey.yilan', name: 'yilan', animated: false, fallback: '🐍', envVar: 'EMOJI_PREY_YILAN' },
  { key: 'prey.sincap', name: 'sincap', animated: false, fallback: '🐿️', envVar: 'EMOJI_PREY_SINCAP' },
  { key: 'prey.tavsan', name: 'tavsan', animated: false, fallback: '🐇', envVar: 'EMOJI_PREY_TAVSAN' },
  { key: 'prey.gelincik', name: 'gelincik', animated: false, fallback: '🦡', envVar: 'EMOJI_PREY_GELINCIK' },
  { key: 'prey.kirpi', name: 'kirpi', animated: false, fallback: '🦔', envVar: 'EMOJI_PREY_KIRPI' },
  { key: 'prey.kedi', name: 'yabankedi', animated: false, fallback: '🐱', envVar: 'EMOJI_PREY_KEDI' },
  { key: 'prey.kaz', name: 'kaz', animated: false, fallback: '🪿', envVar: 'EMOJI_PREY_KAZ' },
  { key: 'prey.keci', name: 'keci', animated: false, fallback: '🐐', envVar: 'EMOJI_PREY_KECI' },
  { key: 'prey.kunduz', name: 'kunduz', animated: false, fallback: '🦫', envVar: 'EMOJI_PREY_KUNDUZ' },
  { key: 'prey.koyun', name: 'koyun', animated: false, fallback: '🐑', envVar: 'EMOJI_PREY_KOYUN' },
  { key: 'prey.tilki', name: 'tilki', animated: false, fallback: '🦊', envVar: 'EMOJI_PREY_TILKI' },
  { key: 'prey.sansar', name: 'sansar', animated: false, fallback: '🦡', envVar: 'EMOJI_PREY_SANSAR' },
  { key: 'prey.kurt', name: 'kurt', animated: false, fallback: '🐺', envVar: 'EMOJI_PREY_KURT' },
  { key: 'prey.yusufcuk', name: 'yusufcuk', animated: false, fallback: '🦟', envVar: 'EMOJI_PREY_YUSUFCUK' },
  { key: 'prey.yengec', name: 'yengec', animated: false, fallback: '🦀', envVar: 'EMOJI_PREY_YENGEC' },
  { key: 'prey.horoz', name: 'horoz', animated: false, fallback: '🐓', envVar: 'EMOJI_PREY_HOROZ' },
  { key: 'prey.penguen', name: 'penguen', animated: false, fallback: '🐧', envVar: 'EMOJI_PREY_PENGUEN' },
  { key: 'prey.kaplumbaga', name: 'kaplumbaga', animated: false, fallback: '🐢', envVar: 'EMOJI_PREY_KAPLUMBAGA' },
  { key: 'prey.bukelemun', name: 'bukelemun', animated: false, fallback: '🦎', envVar: 'EMOJI_PREY_BUKELEMUN' },
  { key: 'prey.panda', name: 'panda', animated: false, fallback: '🐼', envVar: 'EMOJI_PREY_PANDA' },
  { key: 'prey.ayi', name: 'ayi', animated: false, fallback: '🐻', envVar: 'EMOJI_PREY_AYI' },

  // Lootbox (2) — sk/wc silah, ek/ec eşya
  { key: 'lootbox.sk', name: 'owl_loot_sk', animated: false, fallback: '⚔️', envVar: 'EMOJI_LOOT_SK' },
  { key: 'lootbox.ek', name: 'owl_loot_ek', animated: false, fallback: '🧰', envVar: 'EMOJI_LOOT_EK' },

  // Buff — av (6)
  { key: 'buff.b001', name: 'owl_buff_keskin', animated: false, fallback: '🎯', envVar: 'EMOJI_BUFF_B001' },
  { key: 'buff.b002', name: 'owl_buff_koku', animated: false, fallback: '🌿', envVar: 'EMOJI_BUFF_B002' },
  { key: 'buff.b003', name: 'owl_buff_nadir_iz', animated: false, fallback: '🔮', envVar: 'EMOJI_BUFF_B003' },
  { key: 'buff.b004', name: 'owl_buff_orman', animated: false, fallback: '🌲', envVar: 'EMOJI_BUFF_B004' },
  { key: 'buff.b005', name: 'owl_buff_tuy', animated: false, fallback: '⭐', envVar: 'EMOJI_BUFF_B005' },
  { key: 'buff.b006', name: 'owl_buff_efsane', animated: false, fallback: '🦅', envVar: 'EMOJI_BUFF_B006' },

  // Upgrade materyali (8)
  { key: 'item.kemik_tozu', name: 'owl_item_kemik', animated: false, fallback: '🦴', envVar: 'EMOJI_ITEM_KEMIK_TOZU' },
  { key: 'item.parlak_tuy', name: 'owl_item_parlak_tuy', animated: false, fallback: '🪶', envVar: 'EMOJI_ITEM_PARLAK_TUY' },
  { key: 'item.kirik_zincir', name: 'owl_item_kirik_zincir', animated: false, fallback: '⛓️', envVar: 'EMOJI_ITEM_KIRIK_ZINCIR' },
  { key: 'item.av_gozu', name: 'owl_item_av_gozu', animated: false, fallback: '💎', envVar: 'EMOJI_ITEM_AV_GOZU' },
  { key: 'item.pence_parcasi', name: 'owl_item_pence', animated: false, fallback: '🦅', envVar: 'EMOJI_ITEM_PENCE_PARCA' },
  { key: 'item.sessizlik_teli', name: 'owl_item_sessizlik', animated: false, fallback: '🎵', envVar: 'EMOJI_ITEM_SESSIZLIK_TELI' },
  { key: 'item.orman_yankisi', name: 'owl_item_orman_yankisi', animated: false, fallback: '🌲', envVar: 'EMOJI_ITEM_ORMAN_YANKISI' },
  { key: 'item.golge_tuyu', name: 'owl_item_golge_tuyu', animated: false, fallback: '🌑', envVar: 'EMOJI_ITEM_GOLGE_TUYU' },

  // Rün — Discord uygulama emojileri (portal name = name alanı)
  { key: 'rune.buyulu_tuy', name: 'tuyparcasi', animated: false, fallback: '🪶', envVar: 'EMOJI_RUNE_BUYULU_TUY' },
  { key: 'rune.kirik_tas', name: 'kiriktas', animated: false, fallback: '🧊', envVar: 'EMOJI_RUNE_KIRIK_TAS' },
  { key: 'rune.kirik_kanat', name: 'sessizkanat', animated: false, fallback: '🖤', envVar: 'EMOJI_RUNE_KIRIK_KANAT' },
  { key: 'rune.orman_kalbi', name: 'ormanruhu', animated: false, fallback: '🍃', envVar: 'EMOJI_RUNE_ORMAN_KALBI' },
  { key: 'rune.gece_nefesi', name: 'gecenefesi', animated: false, fallback: '🌀', envVar: 'EMOJI_RUNE_GECE_NEFESI' },
  { key: 'rune.son_nefes', name: 'sonnefes', animated: false, fallback: '🌬️', envVar: 'EMOJI_RUNE_SON_NEFES' },
  { key: 'rune.altin_totem', name: 'altintotem', animated: false, fallback: '🗿', envVar: 'EMOJI_RUNE_ALTIN_TOTEM' },
  { key: 'rune.kadim_yumurta', name: 'kadim_yumurta', animated: false, fallback: '🥚', envVar: 'EMOJI_RUNE_KADIM_YUMURTA' },
  { key: 'rune.hiclik_ozu', name: 'hiclikozu', animated: false, fallback: '🕳️', envVar: 'EMOJI_RUNE_HICLIK_OZU' },

  // Rün rarity + bilinmeyen
  { key: 'rarity.yaygin', name: 'yaygin', animated: false, fallback: '⚪', envVar: 'EMOJI_RARITY_YAYGIN' },
  { key: 'rarity.ender', name: 'ender', animated: false, fallback: '🟢', envVar: 'EMOJI_RARITY_ENDER' },
  { key: 'rarity.nadir', name: 'nadir', animated: false, fallback: '🟣', envVar: 'EMOJI_RARITY_NADIR' },
  { key: 'rarity.efsanevi', name: 'efsanevi', animated: false, fallback: '🌟', envVar: 'EMOJI_RARITY_EFSANEVI' },
  { key: 'ui.soru', name: 'soru', animated: false, fallback: '❓', envVar: 'EMOJI_UI_SORU' },
];

const defs: EmojiRef[] = [...MOON_DEFS, ...OWL_MOON_DEFS, ...entityDefs];

const EMOJI_MAP: Record<string, EmojiRef> = Object.fromEntries(
  defs.map((def) => [def.key, def]),
);

/** Görünen isim / envanter adı → registry key */
const NAME_TO_KEY: Record<string, string> = {
  // Lootbox
  'Silah Kutusu': 'lootbox.sk',
  'Eşya Kutusu': 'lootbox.ek',
  // Buff
  'Keskin Nişan': 'buff.b001',
  'Av Kokusu': 'buff.b002',
  'Nadir İz': 'buff.b003',
  'Orman Ruhu': 'buff.b004',
  'Yıldız Tüy': 'buff.b005',
  'Efsane Av Ruhu': 'buff.b006',
  // Materyal
  'Kemik Tozu': 'item.kemik_tozu',
  'Parlak Tüy': 'item.parlak_tuy',
  'Kırık Av Zinciri': 'item.kirik_zincir',
  'Av Gözü Kristali': 'item.av_gozu',
  'Yırtıcı Pençe Parçası': 'item.pence_parcasi',
  'Sessizlik Teli': 'item.sessizlik_teli',
  'Orman Yankısı': 'item.orman_yankisi',
  'Gölge Tüyü': 'item.golge_tuyu',
  // Rün
  'Büyülü Tüy': 'rune.buyulu_tuy',
  'Kırık Taş': 'rune.kirik_tas',
  'Kırık Kanat': 'rune.kirik_kanat',
  'Orman Kalbi': 'rune.orman_kalbi',
  'Gece Nefesi': 'rune.gece_nefesi',
  'Son Nefes': 'rune.son_nefes',
  'Altın Totem': 'rune.altin_totem',
  'Kadim Yumurta': 'rune.kadim_yumurta',
  'Hiçlik Özü': 'rune.hiclik_ozu',
  // Prey (envanterde küçük harf)
  fare: 'prey.fare',
  serce: 'prey.serce',
  kurbaga: 'prey.kurbaga',
  kertenkele: 'prey.kertenkele',
  hamster: 'prey.hamster',
  kostebek: 'prey.kostebek',
  yarasa: 'prey.yarasa',
  bildircin: 'prey.bildircin',
  guvercin: 'prey.guvercin',
  yilan: 'prey.yilan',
  sincap: 'prey.sincap',
  tavsan: 'prey.tavsan',
  gelincik: 'prey.gelincik',
  kirpi: 'prey.kirpi',
  kedi: 'prey.kedi',
  kaz: 'prey.kaz',
  keci: 'prey.keci',
  kunduz: 'prey.kunduz',
  koyun: 'prey.koyun',
  tilki: 'prey.tilki',
  sansar: 'prey.sansar',
  kurt: 'prey.kurt',
  yusufcuk: 'prey.yusufcuk',
  yengec: 'prey.yengec',
  horoz: 'prey.horoz',
  penguen: 'prey.penguen',
  kaplumbaga: 'prey.kaplumbaga',
  bukelemun: 'prey.bukelemun',
  panda: 'prey.panda',
  ayi: 'prey.ayi',
};

const LOOTBOX_ID_TO_KEY: Record<string, string> = {
  sk: 'lootbox.sk',
  ek: 'lootbox.ek',
  wc: 'lootbox.sk',
  ec: 'lootbox.ek',
};

function envEmojiId(def: EmojiRef): string | undefined {
  const raw = process.env[def.envVar];
  if (raw) {
    const cleaned = raw.trim();
    if (/^\d+$/.test(cleaned)) return cleaned;
  }
  const live = getLiveApplicationEmoji(def.name);
  if (live?.id) return live.id;
  return OWL_EVOLUTION_EMOJI_BY_NAME[def.name]?.id
    ?? GAME_ENTITY_EMOJI_BY_NAME[def.name]?.id;
}

function isAnimated(def: EmojiRef): boolean {
  const live = getLiveApplicationEmoji(def.name);
  if (live) return live.animated;
  return OWL_EVOLUTION_EMOJI_BY_NAME[def.name]?.animated
    ?? GAME_ENTITY_EMOJI_BY_NAME[def.name]?.animated
    ?? def.animated;
}

/**
 * Custom emoji markup. ID yoksa unicode fallback.
 * Hydrate sonrası: uygulamada olmayan isim için asla `<:name:staleId>` yazma
 * (Discord istemcisi bunu `:name:` düz metin olarak gösterir).
 *
 * @param key Registry key
 * @param fallbackOverride Opsiyonel unicode
 */
export function renderEmoji(key: string, fallbackOverride?: string): string {
  const def = EMOJI_MAP[key];
  if (!def) return fallbackOverride ?? '📦';
  if (isApplicationEmojiHydrated() && !getLiveApplicationEmoji(def.name)) {
    return fallbackOverride ?? def.fallback;
  }
  const id = envEmojiId(def);
  if (!id) return fallbackOverride ?? def.fallback;
  const prefix = isAnimated(def) ? 'a' : '';
  return `<${prefix}:${def.name}:${id}>`;
}

export function getEmojiDef(key: string): EmojiRef | undefined {
  return EMOJI_MAP[key];
}

export function discordEmoji(
  key: string,
  fallbackName = 'emoji',
): { id: string; name: string; animated?: boolean } | undefined {
  const def = EMOJI_MAP[key];
  if (!def) return undefined;
  if (isApplicationEmojiHydrated() && !getLiveApplicationEmoji(def.name)) {
    return undefined;
  }
  const id = envEmojiId(def);
  if (!id) return undefined;
  return { id, name: def.name || fallbackName, animated: isAnimated(def) || undefined };
}

export function renderMoonEmoji(moonTier: number, fallback = '🌑'): string {
  if (moonTier >= 1 && moonTier <= 7) return renderEmoji(`moon.m${moonTier}`, fallback);
  return fallback;
}

export function renderOwlMoonEmoji(speciesTier: number, moonTier: number, fallback = '🦉'): string {
  if (speciesTier >= 1 && speciesTier <= 8 && moonTier >= 1 && moonTier <= 7) {
    return renderEmoji(`owl.s${speciesTier}.t${moonTier}`, fallback);
  }
  return fallback;
}

/** @deprecated renderOwlMoonEmoji kullanın. */
export function renderOwlPrestigeEmoji(speciesTier: number, moonTier: number, fallback = '🦉'): string {
  return renderOwlMoonEmoji(speciesTier, moonTier, fallback);
}

/** @deprecated renderOwlMoonEmoji(speciesTier, 1) kullanın. */
export function renderOwlEmoji(tier: number, fallback = '🦉'): string {
  return renderOwlMoonEmoji(tier, 1, fallback);
}

export function renderPreyEmoji(preyName: string, fallback = '🐾'): string {
  const normalized = preyName.trim().toLowerCase();
  const key = NAME_TO_KEY[normalized] ?? `prey.${normalized}`;
  if (EMOJI_MAP[key]) return renderEmoji(key, fallback);
  return fallback;
}

export function renderItemEmoji(itemName: string, fallback = '📦'): string {
  const trimmed = itemName.trim();
  const key = NAME_TO_KEY[trimmed] ?? NAME_TO_KEY[trimmed.toLowerCase()];
  if (key) return renderEmoji(key, fallback);
  return fallback;
}

export function renderLootboxEmoji(idOrName: string, fallback = '📦'): string {
  const byId = LOOTBOX_ID_TO_KEY[idOrName.trim().toLowerCase()];
  if (byId) return renderEmoji(byId, fallback);
  return renderItemEmoji(idOrName, fallback);
}

export function renderBuffEmoji(buffIdOrName: string, fallback = '✨'): string {
  const raw = buffIdOrName.trim();
  if (/^b\d{3}$/i.test(raw)) return renderEmoji(`buff.${raw.toLowerCase()}`, fallback);
  const key = NAME_TO_KEY[raw];
  if (key?.startsWith('buff.')) return renderEmoji(key, fallback);
  return fallback;
}

/** Buff tanımı için Discord emoji (yoksa config fallback). */
export function displayBuffEmoji(def: { name: string; emoji: string }): string {
  return renderBuffEmoji(def.name, def.emoji);
}

/** Lootbox tanımı için Discord emoji (yoksa config fallback). */
export function displayLootboxEmoji(def: { id: string; emoji: string }): string {
  return renderLootboxEmoji(def.id, def.emoji);
}

export function allEmojiDefs(): EmojiRef[] {
  return defs.map((def) => ({ ...def }));
}

export function owlEvolutionEmojiDefs(): EmojiRef[] {
  return [...MOON_DEFS, ...OWL_MOON_DEFS].map((def) => ({ ...def }));
}
