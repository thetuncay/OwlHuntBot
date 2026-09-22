/**
 * Sosyal aksiyon sabitleri — OwO tarzı SFW GIF komutları.
 *
 * Açık NSFW / hentai yok. Kaynaklar: otakugifs, nekos.life (SFW), nekos.best.
 */

/** Komut başına cooldown (ms). */
export const SOCIAL_ACTION_COOLDOWN_MS = 4_000;

/** Cache’te aksiyon başına tutulan GIF URL üst sınırı. */
export const SOCIAL_GIF_CACHE_CAP = 48;

/** Cache TTL (saniye) — API’ye bağımlılığı azaltır. */
export const SOCIAL_GIF_CACHE_TTL_SEC = 7 * 24 * 60 * 60;

export type SocialGifSource =
  | { kind: 'otakugifs'; reaction: string }
  | { kind: 'nekoslife'; category: string }
  | { kind: 'nekosbest'; category: string };

export interface SocialActionDef {
  id: string;
  /** Kullanıcıya görünen komut adları (ilk = canonical). */
  names: readonly string[];
  /** Embed author şablonları — `{actor}` `{target}` */
  templates: readonly string[];
  /** SFW GIF kaynakları. */
  sources: readonly SocialGifSource[];
  /** Embed rengi. */
  color: number;
}

/**
 * Çekirdek 10 aksiyon — yalnızca SFW.
 */
export const SOCIAL_ACTION_DEFS: readonly SocialActionDef[] = [
  {
    id: 'kiss',
    names: ['kiss'],
    templates: [
      '{actor}, {target} ile derin bir öpüşme yaşadı~',
      '{actor}, {target} üzerine yavaş bir öpücük bıraktı…',
      '{actor}, {target} ağzından aç bir öpücük çaldı~',
      '{actor} yaklaştı ve {target} ile yumuşakça öpüştü…',
    ],
    sources: [
      { kind: 'otakugifs', reaction: 'kiss' },
      { kind: 'otakugifs', reaction: 'lick' },
      { kind: 'nekoslife', category: 'kiss' },
      { kind: 'nekosbest', category: 'kiss' },
    ],
    color: 0xf4a6c4,
  },
  {
    id: 'hug',
    names: ['hug'],
    templates: [
      '{actor}, {target} ile göğüs göğüse sarıldı~',
      '{actor}, {target} kişisini yapışkan bir kucaklamaya çekti…',
      '{actor}, {target} kişisini bıraktırmıyor~',
    ],
    sources: [
      { kind: 'otakugifs', reaction: 'hug' },
      { kind: 'otakugifs', reaction: 'cuddle' },
      { kind: 'nekoslife', category: 'hug' },
      { kind: 'nekosbest', category: 'hug' },
    ],
    color: 0x9bceff,
  },
  {
    id: 'love',
    names: ['love'],
    templates: [
      '{actor}, {target} için aşk dolu bakışlar attı~',
      '{actor}, {target} kulağına tatlı bir fısıltı bıraktı…',
      '{actor}, {target} üzerine eriyip yapıştı~',
      '{actor}, {target} kişisinden ellerini çekemiyor…',
    ],
    sources: [
      { kind: 'otakugifs', reaction: 'love' },
      { kind: 'otakugifs', reaction: 'kiss' },
      { kind: 'otakugifs', reaction: 'handhold' },
      { kind: 'nekoslife', category: 'kiss' },
      { kind: 'nekoslife', category: 'cuddle' },
    ],
    color: 0xff6b9d,
  },
  {
    id: 'punch',
    names: ['punch', 'punc'],
    templates: [
      '{actor}, {target} kişisine yumruk attı!',
      '{actor}, {target} kişisine şakacı bir yumruk çaktı!',
      '{actor}, {target} kişisine bonk!',
    ],
    sources: [
      { kind: 'otakugifs', reaction: 'punch' },
      { kind: 'otakugifs', reaction: 'slap' },
      { kind: 'nekoslife', category: 'slap' },
      { kind: 'nekosbest', category: 'slap' },
    ],
    color: 0xe74c3c,
  },
  {
    id: 'slap',
    names: ['slap'],
    templates: [
      '{actor}, {target} kişisine tokat attı!',
      '{actor}, {target} kişisine sert bir şaplak çaktı~',
      '{actor}, {target} kişisine alaycı bir şaplak attı~',
    ],
    sources: [
      { kind: 'otakugifs', reaction: 'slap' },
      { kind: 'nekoslife', category: 'slap' },
      { kind: 'nekosbest', category: 'slap' },
    ],
    color: 0xe67e22,
  },
  {
    id: 'pat',
    names: ['pat'],
    templates: [
      '{actor}, {target} başını yumuşakça okşadı~',
      '{actor}, {target} kişisini headpat\'lerle şımarttı…',
      '{actor}, {target} saçını sevgiyle dağıttı~',
    ],
    sources: [
      { kind: 'otakugifs', reaction: 'pat' },
      { kind: 'nekoslife', category: 'pat' },
      { kind: 'nekosbest', category: 'pat' },
    ],
    color: 0xf1c40f,
  },
  {
    id: 'cuddle',
    names: ['cuddle'],
    templates: [
      '{actor}, {target} kucağına sokuldu~',
      '{actor} yüzünü {target} üzerine gömdü…',
      '{actor}, {target} ile sıcak nefesle sarıldı…',
      '{actor}, {target} kişisini sabah hiç gelmesin diye tutuyor~',
    ],
    sources: [
      { kind: 'otakugifs', reaction: 'cuddle' },
      { kind: 'otakugifs', reaction: 'kiss' },
      { kind: 'nekoslife', category: 'cuddle' },
      { kind: 'nekosbest', category: 'hug' },
    ],
    color: 0xbb8fce,
  },
  {
    id: 'wave',
    names: ['wave'],
    templates: [
      '{actor}, {target} kişisine el salladı!',
      '{actor}, {target} kişisine merhaba dedi~',
      '{actor}, {target} kişisine göz kırpıp el salladı~',
    ],
    sources: [
      { kind: 'otakugifs', reaction: 'wave' },
      { kind: 'nekosbest', category: 'wave' },
    ],
    color: 0x5dade2,
  },
  {
    id: 'highfive',
    names: ['highfive', 'hf'],
    templates: [
      '{actor}, {target} ile çak beş yaptı!',
      '{actor} ve {target}: muhteşem bir çak beş!',
    ],
    sources: [
      { kind: 'nekosbest', category: 'highfive' },
    ],
    color: 0x58d68d,
  },
  {
    id: 'poke',
    names: ['poke'],
    templates: [
      '{actor}, {target} kişisini şakacı bir şekilde dürttü~',
      '{actor}, {target} kişisini nazikçe dürterek kızdırdı…',
      '{actor}, {target} kişisini yine… ve yine dürttü~',
    ],
    sources: [
      { kind: 'otakugifs', reaction: 'poke' },
      { kind: 'nekosbest', category: 'poke' },
    ],
    color: 0xaf7ac5,
  },
] as const;

const BY_NAME = new Map<string, SocialActionDef>();
for (const def of SOCIAL_ACTION_DEFS) {
  for (const n of def.names) BY_NAME.set(n.toLowerCase(), def);
}

/** Komut adından aksiyon tanımı. */
export function resolveSocialAction(raw: string): SocialActionDef | null {
  return BY_NAME.get(raw.toLowerCase()) ?? null;
}

/** Tüm canonical + alias isimleri (router için). */
export function allSocialActionNames(): string[] {
  return SOCIAL_ACTION_DEFS.flatMap((d) => [...d.names]);
}
