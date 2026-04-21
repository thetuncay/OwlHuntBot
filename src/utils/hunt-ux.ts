/**
 * hunt-ux.ts — Hunt mesaj katmanı
 * Backend logic'e dokunmaz. Sadece çıktı.
 */

import type { HuntRunResult } from '../types';
import { PREY } from '../config';

// ─── Prey meta ────────────────────────────────────────────────────────────────
const PREY_EMOJI: Record<string, string> = {
  fare: '🐭', serce: '🐦', kurbaga: '🐸', kertenkele: '🦎',
  hamster: '🐹', kostebek: '🐀', yarasa: '🦇', bildircin: '🐤',
  guvercin: '🕊️', yilan: '🐍', sincap: '🐿️', tavsan: '🐇',
  gelincik: '🦡', kirpi: '🦔',
};

const PREY_SELL: Record<string, number> = Object.fromEntries(
  PREY.map((p) => [p.name, p.sellPrice]),
);

// Nadir hayvanlar — özel efekt alır
const RARE_PREY = new Set(['tavsan', 'gelincik', 'kirpi', 'yilan']);

// ─── Yardımcılar ─────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function getPreyRarity(difficulty: number): 'Common' | 'Uncommon' | 'Rare' {
  if (difficulty >= 7) return 'Rare';
  if (difficulty >= 4) return 'Uncommon';
  return 'Common';
}

// ─── Sonuç sıkıştırma ────────────────────────────────────────────────────────
export interface CompressedHunt {
  groups: {
    name: string;
    emoji: string;
    count: number;
    rare: boolean;
    rarity: string;
    sellPrice: number;
    totalValue: number;
  }[];
  totalXP: number;
  totalValue: number;
  hasCritical: boolean;
  levelUp: { oldLevel: number; newLevel: number } | null;
  isEmpty: boolean;
  encounterId?: string;
  /** Aktif buff'lar — hunt satırında gösterilir */
  activeBuffs?: { emoji: string; chargeCur: number; chargeMax: number }[];
}

export function compressHuntResult(result: HuntRunResult): CompressedHunt {
  const counts = new Map<string, {
    name: string; count: number; rare: boolean;
    rarity: string; sellPrice: number; difficulty: number;
  }>();

  for (const c of result.catches) {
    const existing = counts.get(c.preyName);
    if (existing) {
      existing.count++;
    } else {
      counts.set(c.preyName, {
        name: c.preyName,
        count: 1,
        rare: RARE_PREY.has(c.preyName),
        rarity: getPreyRarity(c.difficulty),
        sellPrice: PREY_SELL[c.preyName] ?? 5,
        difficulty: c.difficulty,
      });
    }
  }

  const isEmpty = counts.size === 0;

  // Rarity sırasına göre sırala: Common → Uncommon → Rare (nadir sonda, dikkat çeker)
  const sorted = [...counts.values()].sort((a, b) => a.difficulty - b.difficulty);
  const groups = sorted.slice(0, 8).map((g) => ({
    name: g.name,
    emoji: PREY_EMOJI[g.name] ?? '🦉',
    count: g.count,
    rare: g.rare,
    rarity: g.rarity,
    sellPrice: g.sellPrice,
    totalValue: g.sellPrice * g.count,
  }));

  const totalValue = groups.reduce((s, g) => s + g.totalValue, 0);
  const hasCritical = result.catches.some((c) => c.critical);

  return {
    groups,
    totalXP: result.totalXP,
    totalValue,
    hasCritical,
    levelUp: result.levelUp ?? null,
    isEmpty,
    encounterId: result.encounterId,
  };
}

// ─── Flavour havuzları ────────────────────────────────────────────────────────
const LINE1_NORMAL = [
  'gece avına çıktı',
  'ormana daldı',
  'izleri takip etti',
  'sessizce süzüldü',
  'karanlığa atladı',
];

const LINE1_CRITICAL = [
  'kritik bir av yaptı',
  'mükemmel bir av gerçekleştirdi',
  'efsanevi bir av tamamladı',
];

const ANIMATION_FRAMES: [string, string, string][] = [
  ['🌲 *snnff*... iz var!',    '🐾 Patiler yere yapışıyor...',  '👁️ Hedef görüş alanında...'],
  ['🌿 *hışırtı*...',          '🌙 Ay ışığında iz takibi...',   '🎯 Şimdi!!'],
  ['🍃 Yapraklar aralanıyor...','🦶 Her adım dikkatli...',       '⚡ Atlamak için doğru an...'],
  ['🌲 Orman sessiz...',        '👃 Koku takip ediliyor...',     '🎯 Hedef görüş alanına girdi!'],
];

const FINISHING = ['🌲 Av tamamlanıyor...', '🏃 Son hamle...', '✨ Neredeyse...', '🎯 Şimdi!!'];

// ─── Final mesaj builder ──────────────────────────────────────────────────────
function buildFinalMessage(name: string, compressed: CompressedHunt): string {
  const lines: string[] = [];

  // ── LINE 1: Status / Buffs ────────────────────────────────────────────────
  const action = compressed.hasCritical
    ? pickRandom(LINE1_CRITICAL)
    : pickRandom(LINE1_NORMAL);

  const statusSuffix = compressed.hasCritical ? ' ⚡' : '';

  // Aktif buff göstergesi — OwO tarzı: emoji[cur/max]
  const buffStr = compressed.activeBuffs && compressed.activeBuffs.length > 0
    ? ` | hunt is empowered by ${compressed.activeBuffs.map((b) => `${b.emoji}\`[${b.chargeCur}/${b.chargeMax}]\``).join(' ')} !`
    : '';

  lines.push(`🌙 | **${name}** ${action}!${statusSuffix}${buffStr}`);

  // ── LINE 2: Loot display ──────────────────────────────────────────────────
  if (compressed.isEmpty) {
    lines.push(`🌿 | Bulunanlar: *(bu sefer şans yüzüne gülmedi...)*`);
  } else {
    // Her hayvanı count kadar tekrarla, nadir olanları özel göster
    const emojiParts: string[] = [];
    for (const g of compressed.groups) {
      if (g.rare) {
        // Nadir hayvan: 🔥emoji🔥 formatı
        for (let i = 0; i < g.count; i++) emojiParts.push(`🔥${g.emoji}🔥`);
      } else {
        for (let i = 0; i < Math.min(g.count, 5); i++) emojiParts.push(g.emoji);
        if (g.count > 5) emojiParts.push(`*(×${g.count})*`);
      }
    }

    const hasRare = compressed.groups.some((g) => g.rare);
    const rareSuffix = hasRare ? ` | ✨ Nadir av yakalandı!` : '';
    lines.push(`🌿 | Bulunanlar: ${emojiParts.join(' ')}${rareSuffix}`);
  }

  // ── LINE 3: Result summary ────────────────────────────────────────────────
  const lootCount = compressed.groups.reduce((s, g) => s + g.count, 0);
  let summary = `🦉 | **+${compressed.totalXP} XP** • **${lootCount} av** 💰 ${compressed.totalValue}`;

  if (compressed.hasCritical) summary += ` 🔥 | Kritik av! Ek loot kazanıldı`;
  else if (lootCount >= 5) summary += ` ✨ | Harika bir av!`;

  if (compressed.levelUp) {
    const { oldLevel: o, newLevel: n } = compressed.levelUp;
    summary += `\n🎊 | **SEVİYE ATLADI!** ${o} ➜ **${n}** ✨`;
  }

  lines.push(summary);

  // Encounter bildirimi — buton mesajı owl.ts'de ayrıca gönderilir
  // Hunt mesajına sadece kısa bir bildirim eklenir
  if (compressed.encounterId) {
    lines.push(`\n🦉 **Yabani baykuş göründü!** Seçimini yap ↓`);
  }

  return lines.join('\n');
}

// ─── Animasyon frame'leri ─────────────────────────────────────────────────────
function buildAnimationFrames(compressed: CompressedHunt): string[] {
  const allEmojis = compressed.groups.map((g) => g.emoji);
  const ph = '❓';
  const [f0, f1, f2] = pickRandom(ANIMATION_FRAMES);
  const f3 = pickRandom(FINISHING);

  const frame0 = `${f0}\n${allEmojis.map(() => ph).join('  ')}`;
  const frame1 = `${f1}\n${allEmojis.map((e, i) => (i === 0 ? e : ph)).join('  ')}`;
  const half = Math.ceil(allEmojis.length / 2);
  const frame2 = `${f2}\n${allEmojis.map((e, i) => (i < half ? e : ph)).join('  ')}`;
  const frame3 = `${f3}\n${allEmojis.join('  ')}`;

  return [frame0, frame1, frame2, frame3];
}

// ─── Animasyon: interaction (slash) ──────────────────────────────────────────
export async function animateHuntInteraction(
  interaction: { reply?: Function; editReply: Function },
  name: string,
  compressed: CompressedHunt,
): Promise<void> {
  const frames = buildAnimationFrames(compressed);
  const final = buildFinalMessage(name, compressed);

  // deferReply yapıldıysa editReply, yapılmadıysa reply kullan
  const firstEdit = interaction.reply
    ? () => interaction.reply!({ content: frames[0] })
    : () => interaction.editReply({ content: frames[0] });

  await firstEdit();
  await sleep(120);
  await interaction.editReply({ content: frames[2] }).catch(() => null);
  await sleep(150);
  await interaction.editReply({ content: final }).catch(() => null);
}

// ─── Animasyon: prefix mesaj ──────────────────────────────────────────────────
export async function animateHuntMessage(
  message: { reply: Function },
  name: string,
  compressed: CompressedHunt,
): Promise<void> {
  const frames = buildAnimationFrames(compressed);
  const final = buildFinalMessage(name, compressed);

  const sent = (await message.reply(frames[0])) as { edit: Function };

  // Sadece 1 ara frame + final
  await sleep(100);
  await sent.edit(frames[2]).catch(() => null);
  await sleep(130);
  await sent.edit(final).catch(() => null);
}
