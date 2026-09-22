/**
 * Günlük görev havuzu — her oyuncuya günde 4 rastgele görev.
 * Market: her sette en az `DAILY_MARKET_QUESTS_MIN` ilan/browse odaklı görev.
 */
import { PREY } from '../config';

export const DAILY_QUESTS_PER_DAY = 4;

/** Her günlük sette garantili market görevi sayısı. */
export const DAILY_MARKET_QUESTS_MIN = 2;

/**
 * Kolay market görevleri — ilan koyma / markete bakma.
 * Günlük sette bunlardan en az `DAILY_MARKET_QUESTS_MIN` tanesi seçilir.
 */
export const MARKET_DAILY_QUEST_TYPES = [
  'market',
  'market_item',
  'market_browse',
  'market_myshop',
] as const;

export type MarketDailyQuestType = (typeof MARKET_DAILY_QUEST_TYPES)[number];

/** İnce piyasada günlük seçime girmez (karşı taraf / yedek baykuş gerekir). */
export const MARKET_HARD_QUEST_TYPES = ['market_buy', 'market_owl'] as const;

export interface DailyQuestVariant {
  tier: 1 | 2 | 3;
  target: number;
  rewardCoins: number;
  rewardXp: number;
}

export interface DailyQuestMeta {
  prey?: string;
  stat?: string;
}

function v(
  targets: [number, number, number],
  coins: [number, number, number],
  xp: [number, number, number],
): DailyQuestVariant[] {
  return [
    { tier: 1, target: targets[0], rewardCoins: coins[0], rewardXp: xp[0] },
    { tier: 2, target: targets[1], rewardCoins: coins[1], rewardXp: xp[1] },
    { tier: 3, target: targets[2], rewardCoins: coins[2], rewardXp: xp[2] },
  ];
}

export const DAILY_QUEST_POOL = [
  'hunt', 'sell', 'use', 'tame', 'market',
  'hunt_streak', 'hunt_critical', 'hunt_rare', 'hunt_species', 'hunt_empty', 'hunt_xp', 'hunt_coin_value',
  'upgrade', 'upgrade_stat', 'setmain', 'bond', 'moon_tier', 'owl_name', 'new_species',
  'duel', 'vs', 'vs_play', 'duelbet', 'pvp_streak',
  'sk', 'ek', 'lootbox_any', 'dismantle', 'buff_hunt', 'buff_active',
  'market_buy', 'market_owl', 'market_item', 'market_browse', 'market_myshop',
  'transfer', 'earn_coins',
  'cf', 'bj', 'slot', 'gamble_win',
  'zoo_new', 'owls_view', 'lb_check', 'katalog', 'daily_claim',
] as const;

export type DailyQuestType = (typeof DAILY_QUEST_POOL)[number];
export const DAILY_QUEST_TYPES = DAILY_QUEST_POOL;

export const DAILY_QUEST_VARIANTS: Record<DailyQuestType, DailyQuestVariant[]> = {
  hunt: v([3,6,10],[650,1100,1850],[120,220,400]),
  sell: v([5,12,25],[550,950,1600],[100,180,320]),
  use: v([1,2,3],[750,1200,2000],[200,320,520]),
  tame: v([1,1,1],[950,1550,2900],[350,550,900]),
  /** Herhangi bir market ilanı (eşya veya baykuş). */
  market: v([1,2,3],[550,900,1400],[95,160,260]),
  hunt_streak: v([1,2,3],[500,900,1500],[90,160,280]),
  hunt_critical: v([1,2,3],[700,1200,2000],[130,230,400]),
  hunt_rare: v([1,2,3],[800,1400,2200],[150,260,420]),
  hunt_species: v([1,2,4],[600,1100,1800],[110,200,340]),
  hunt_empty: v([1,2,3],[400,700,1100],[80,140,220]),
  hunt_xp: v([30,60,100],[500,900,1500],[100,180,300]),
  hunt_coin_value: v([300,700,1500],[550,1000,1700],[95,170,290]),
  upgrade: v([1,2,4],[650,1100,1900],[120,210,360]),
  upgrade_stat: v([1,2,3],[700,1200,2000],[130,230,390]),
  setmain: v([1,1,1],[500,800,1200],[90,140,200]),
  bond: v([1,2,3],[450,800,1300],[85,150,250]),
  moon_tier: v([1,1,2],[900,1600,2800],[200,360,600]),
  owl_name: v([1,1,1],[400,600,900],[80,120,180]),
  new_species: v([1,1,1],[1000,1800,3000],[220,400,650]),
  duel: v([1,2,4],[600,1100,1800],[110,200,340]),
  vs: v([1,1,2],[800,1400,2400],[150,260,440]),
  vs_play: v([1,2,3],[500,900,1500],[95,170,290]),
  duelbet: v([1,1,2],[900,1600,2600],[170,300,480]),
  pvp_streak: v([2,3,4],[700,1300,2100],[130,240,390]),
  sk: v([1,2,3],[550,950,1600],[100,175,300]),
  ek: v([1,2,3],[550,950,1600],[100,175,300]),
  lootbox_any: v([1,2,4],[600,1050,1750],[105,190,320]),
  dismantle: v([1,3,6],[500,900,1500],[95,170,280]),
  buff_hunt: v([1,2,3],[650,1150,1900],[120,210,350]),
  buff_active: v([2,3,3],[500,850,1200],[95,160,220]),
  market_buy: v([1,2,3],[600,1100,1800],[100,180,300]),
  market_owl: v([1,1,1],[800,1400,2200],[140,250,400]),
  /** Eşya / av / buff ilanı (baykuş değil). */
  market_item: v([1,2,3],[500,850,1300],[90,150,240]),
  /** Market hub’a bak — envanter gerekmez. */
  market_browse: v([1,1,1],[350,500,750],[70,100,150]),
  /** Kendi dükkânına bak. */
  market_myshop: v([1,1,1],[350,500,750],[70,100,150]),
  transfer: v([1,2,3],[450,800,1300],[85,150,250]),
  earn_coins: v([500,1500,3000],[600,1200,2000],[100,200,340]),
  cf: v([2,4,6],[450,800,1300],[85,150,250]),
  bj: v([1,2,4],[500,900,1500],[95,170,290]),
  slot: v([2,4,8],[500,900,1500],[95,170,290]),
  gamble_win: v([1,2,3],[700,1300,2100],[130,240,390]),
  zoo_new: v([1,2,3],[550,1000,1700],[100,185,310]),
  owls_view: v([1,1,1],[350,500,750],[70,100,150]),
  lb_check: v([1,1,1],[350,500,750],[70,100,150]),
  katalog: v([1,1,2],[400,650,1000],[80,130,200]),
  daily_claim: v([1,2,4],[400,750,1200],[80,150,240]),
};

const STAT_LABELS: Record<string, string> = {
  gaga: 'Gaga', goz: 'Göz', kulak: 'Kulak', kanat: 'Kanat', pence: 'Pençe',
};

export function parseDailyQuestMeta(raw: string | null | undefined): DailyQuestMeta | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as DailyQuestMeta; } catch { return null; }
}

export function formatDailyQuestLabel(type: DailyQuestType, target: number, metaRaw?: string | null): string {
  const meta = parseDailyQuestMeta(metaRaw);
  switch (type) {
    case 'hunt': return `${target} hayvan avla`;
    case 'sell': return `${target} av sat (coin için)`;
    case 'use': return `${target} av buff tak`;
    case 'tame': return 'Yabani baykuş evcilleştir';
    case 'market': return `${target} market ilanı koy`;
    case 'hunt_streak': return `${target} kez 3+ av serisi`;
    case 'hunt_critical': return `${target} kritik av`;
    case 'hunt_rare': return `${target} nadir av`;
    case 'hunt_species': return `${target} ${meta?.prey ?? 'hedef'} avla`;
    case 'hunt_empty': return `${target} av dene`;
    case 'hunt_xp': return `Avdan ${target} XP kazan`;
    case 'hunt_coin_value': return `${target} coin değerinde av topla`;
    case 'upgrade': return `${target} stat yükselt`;
    case 'upgrade_stat': return `${target} ${STAT_LABELS[meta?.stat ?? ''] ?? meta?.stat ?? 'stat'} yükselt`;
    case 'setmain': return 'Main baykuş değiştir';
    case 'bond': return `${target} bağ güçlendir`;
    case 'moon_tier': return `${target} moon tier atla`;
    case 'owl_name': return 'Takma ad ver';
    case 'new_species': return 'Yeni tür evcilleştir';
    case 'duel': return `Bot düellosu kazan (${target})`;
    case 'vs': return `Oyuncu düellosu kazan (${target})`;
    case 'pvp_streak': return `${target} düello serisi tut`;
    case 'vs_play': return `${target} PvP oyna`;
    case 'duelbet': return `${target} bahisli düello`;
    case 'sk': return `${target} silah kutusu aç`;
    case 'ek': return `${target} eşya kutusu aç`;
    case 'lootbox_any': return `${target} kutu aç`;
    case 'dismantle': return `${target} av parçala (materyal)`;
    case 'buff_hunt': return `${target} av buff tak`;
    case 'buff_active': return `${target} aktif buff`;
    case 'market_buy': return `${target} ilan al`;
    case 'market_owl': return 'Baykuş ilanı koy';
    case 'market_item': return `${target} eşya veya av ilanı koy`;
    case 'market_browse': return 'Markete bak';
    case 'market_myshop': return 'Kendi dükkânına bak';
    case 'transfer': return `${target} coin gönder`;
    case 'earn_coins': return `${target} coin kazan`;
    case 'cf': return `${target} yazı tura`;
    case 'bj': return `${target} gölge 21`;
    case 'slot': return `${target} slot çevir`;
    case 'gamble_win': return `${target} kumar kazan`;
    case 'zoo_new': return `${target} yeni tür keşfet`;
    case 'owls_view': return 'Koleksiyona bak';
    case 'lb_check': return 'Liderboard\'a bak';
    case 'katalog': return 'Kataloga bak';
    case 'daily_claim': return `${target} ödül al`;
    default: return `${target} görev`;
  }
}

export function rollQuestMeta(type: DailyQuestType, seed: string): DailyQuestMeta | null {
  const hash = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0);
  if (type === 'hunt_species') {
    const prey = PREY.map((p) => p.name);
    return { prey: prey[hash % prey.length]! };
  }
  if (type === 'upgrade_stat') {
    const stats = ['gaga','goz','kulak','kanat','pence'] as const;
    return { stat: stats[hash % stats.length]! };
  }
  return null;
}

/** Verilen tip market teşvik havuzunda mı? */
export function isMarketDailyQuestType(type: DailyQuestType): boolean {
  return (MARKET_DAILY_QUEST_TYPES as readonly string[]).includes(type);
}
