/**
 * pvp-ux.ts — PvP animasyon ve çıktı katmanı
 * Backend logic'e dokunmaz. Sadece UX.
 */

// ─── Tipler ───────────────────────────────────────────────────────────────────
export interface PvpTurnEvent {
  turn: number;
  attackerId: string;
  defenderId: string;
  damage: number;
  attackerHp: number;
  defenderHp: number;
  attackerHpMax: number;
  defenderHpMax: number;
  isCrit: boolean;
  isExecute: boolean;
  isLastHit: boolean;
}

export interface PvpBattleData {
  challengerId: string;
  challengerName: string;
  challengerHpMax: number;
  defenderId: string;
  defenderName: string;
  defenderHpMax: number;
  events: PvpTurnEvent[];
  winnerId: string;
  loserId: string;
  totalTurns: number;
  winnerXP: number;
  loserXP: number;
  /** Streak sistemi sonuçları */
  streak?: import('../systems/pvp-streak').StreakUpdateResult;
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function hpBar(hp: number, hpMax: number, len = 8): string {
  const pct    = Math.max(0, Math.min(hp / hpMax, 1));
  const filled = Math.round(pct * len);
  const empty  = len - filled;
  const color  = pct > 0.5 ? '🟩' : pct > 0.25 ? '🟨' : '🟥';
  return `${color}\`${'█'.repeat(filled)}${'░'.repeat(empty)}\` **${hp}**`;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

// ─── Flavour ─────────────────────────────────────────────────────────────────
const HIT_LINES   = ['💥 vurdu!', '⚔️ saldırdı!', '🦅 atıldı!', '💢 çarptı!'];
const CRIT_LINES  = ['🔥 **KRİTİK!!**', '⚡ **GÜÇLÜ DARBE!!**', '💥 **MÜKEMMEL!!**'];
const EXEC_LINES  = ['💀 **SON DARBE!!**', '☠️ **BİTİRDİ!!**', '🩸 **EXECUTE!!**'];
const DODGE_LINES = ['🛡️ zayıf darbe...', '💨 kaçındı!', '🌀 savuşturdu!'];

// ─── Log sıkıştırma ───────────────────────────────────────────────────────────
export function compressBattleLog(events: PvpTurnEvent[], maxFrames = 5): PvpTurnEvent[] {
  if (events.length <= maxFrames) return events;

  const important = events.filter((e) => e.isCrit || e.isExecute || e.isLastHit);
  const first     = events[0]!;
  const last      = events[events.length - 1]!;

  // Önemli olayları al, ilk ve son her zaman dahil
  const selected = new Set<PvpTurnEvent>([first, ...important.slice(0, maxFrames - 2), last]);
  return [...selected].sort((a, b) => a.turn - b.turn);
}

// ─── Frame builder ───────────────────────────────────────────────────────────
function buildBattleFrame(
  event: PvpTurnEvent,
  data: PvpBattleData,
): string {
  // Attacker challenger mı defender mı?
  const attackerIsChallenger = event.attackerId === data.challengerId;

  const attackerName = attackerIsChallenger ? data.challengerName : data.defenderName;

  // Challenger'ın HP'si: attacker challenger ise attackerHp, değilse defenderHp
  const challengerHp = attackerIsChallenger ? event.attackerHp : event.defenderHp;
  const defenderHp   = attackerIsChallenger ? event.defenderHp : event.attackerHp;

  const actionLine = event.isExecute
    ? `${pickRandom(EXEC_LINES)} **-${event.damage}** HP`
    : event.isCrit
    ? `${pickRandom(CRIT_LINES)} **-${event.damage}** HP`
    : event.damage < 5
    ? `${pickRandom(DODGE_LINES)} **-${event.damage}** HP`
    : `${pickRandom(HIT_LINES)} **-${event.damage}** HP`;

  return [
    `⚔️ **Tur ${event.turn}**`,
    ``,
    `🦉 **${data.challengerName}**`,
    hpBar(challengerHp, data.challengerHpMax),
    ``,
    `🦉 **${data.defenderName}**`,
    hpBar(defenderHp, data.defenderHpMax),
    ``,
    `> **${attackerName}** ${actionLine}`,
  ].join('\n');
}

// ─── VS ekranı ───────────────────────────────────────────────────────────────
function buildVsScreen(data: PvpBattleData): string {
  return [
    `⚔️ **DÖVÜŞ BAŞLIYOR!**`,
    ``,
    `🦉 **${data.challengerName}**`,
    hpBar(data.challengerHpMax, data.challengerHpMax),
    ``,
    `**VS**`,
    ``,
    `🦉 **${data.defenderName}**`,
    hpBar(data.defenderHpMax, data.defenderHpMax),
  ].join('\n');
}

// ─── Sonuç ekranı ─────────────────────────────────────────────────────────────
function buildResultScreen(data: PvpBattleData): string {
  const winnerName = data.winnerId === data.challengerId ? data.challengerName : data.defenderName;
  const loserName  = data.loserId  === data.challengerId ? data.challengerName : data.defenderName;
  const s = data.streak;

  // ── Temel sonuç ──────────────────────────────────────────────────────────
  const lines: string[] = [
    `🏆 **${winnerName} KAZANDI!**`,
    ``,
    `🥇 ${winnerName} — zafer! +${data.winnerXP} XP · +100 💰`,
    `💀 ${loserName} — yenildi. +${data.loserXP} XP`,
    ``,
    `> ⚔️ Toplam tur: **${data.totalTurns}**`,
  ];

  // ── Streak bilgisi ────────────────────────────────────────────────────────
  if (s) {
    lines.push('');

    if (s.streakCounted) {
      // Streak arttı
      const streakLine = s.newStreak === 1
        ? `🔥 Streak başladı! **(1)**`
        : s.newStreak > s.oldStreak
        ? `🔥 Streak: **${s.newStreak}** *(+1)*`
        : `🔥 Streak: **${s.newStreak}**`;

      lines.push(streakLine);

      // Bonus varsa göster
      if (s.xpBonusPct > 0 || s.bonusCoins > 0) {
        const bonusParts: string[] = [];
        if (s.xpBonusPct > 0) bonusParts.push(`+${s.xpBonusPct}% XP`);
        if (s.bonusCoins > 0) bonusParts.push(`+${s.bonusCoins} 💰`);
        lines.push(`📈 Streak bonusu: **${bonusParts.join(' · ')}**`);
      }

      // Yeni rekor
      if (s.isNewRecord) {
        lines.push(`🏅 **Yeni rekor! En yüksek streak: ${s.bestStreak}**`);
      }

      // Milestone mesajı
      if (s.milestoneMsg) {
        lines.push(``, `> ${s.milestoneMsg}`);
      }
    } else {
      // Anti-abuse: streak sayılmadı
      lines.push(`⚠️ *Rakip çok zayıf — streak sayılmadı.*`);
      lines.push(`🔥 Streak: **${s.oldStreak}** *(değişmedi)*`);
    }

    // Kaybeden için streak bozuldu mesajı (sadece kaybeden görür — UX notu)
    // Bu satır kazananın ekranında gösterilir, kaybeden kendi mesajında görür
    if (s.brokenStreak && s.brokenStreak >= 3) {
      lines.push(``, `💀 ${loserName}'in **${s.brokenStreak}** streak'i bozuldu!`);
    }
  }

  return lines.join('\n');
}

// ─── Ana animasyon: interaction ───────────────────────────────────────────────
export async function animatePvPInteraction(
  interaction: { editReply: Function },
  data: PvpBattleData,
): Promise<void> {
  // Max 3 frame: ilk, kritik/execute, son
  const frames = compressBattleLog(data.events, 3);

  // VS ekranı + ilk frame birleşik — 1 edit tasarrufu
  await interaction.editReply({ content: buildVsScreen(data), components: [] });
  await sleep(300);

  // Savaş frame'leri
  for (const event of frames) {
    await sleep(150);
    await interaction.editReply({ content: buildBattleFrame(event, data) }).catch(() => null);
  }

  // Sonuç
  await sleep(200);
  await interaction.editReply({ content: buildResultScreen(data) }).catch(() => null);
}

// ─── Ana animasyon: message ───────────────────────────────────────────────────
export async function animatePvPMessage(
  sent: { edit: Function },
  data: PvpBattleData,
): Promise<void> {
  const frames = compressBattleLog(data.events, 3);

  await sent.edit({ content: buildVsScreen(data), components: [] });
  await sleep(300);

  for (const event of frames) {
    await sleep(150);
    await sent.edit({ content: buildBattleFrame(event, data) }).catch(() => null);
  }

  await sleep(200);
  await sent.edit({ content: buildResultScreen(data) }).catch(() => null);
}

// ─── Simüle PvP (Bot Duel) UX ────────────────────────────────────────────────

import type { SimPvpResult } from '../systems/pvp-sim';

/**
 * Simüle PvP için PvpBattleData oluşturur.
 * Gerçek PvP animasyon fonksiyonlarını yeniden kullanır.
 */
export function buildSimBattleData(
  playerId: string,
  playerName: string,
  playerHpMax: number,
  result: SimPvpResult,
): PvpBattleData {
  return {
    challengerId:    playerId,
    challengerName:  playerName,
    challengerHpMax: playerHpMax,
    defenderId:      'bot',
    defenderName:    result.opponent.name,
    defenderHpMax:   result.opponent.hpMax,
    events:          result.events,
    winnerId:        result.playerWon ? playerId : 'bot',
    loserId:         result.playerWon ? 'bot' : playerId,
    totalTurns:      result.turns,
    winnerXP:        result.xpGained,
    loserXP:         result.playerWon ? 0 : result.xpGained,
    streak:          result.playerWon ? {
      newStreak:     result.streak.newStreak,
      oldStreak:     result.streak.oldStreak,
      bestStreak:    result.streak.bestStreak,
      isNewRecord:   result.streak.isNewRecord,
      streakCounted: result.streak.streakCounted,
      xpBonusPct:    result.streak.xpBonusPct,
      bonusCoins:    result.streak.bonusCoins,
      milestoneMsg:  result.streak.milestoneMsg,
    } : undefined,
  };
}

/**
 * Simüle PvP için VS ekranı — düşman zorluk etiketi gösterilir.
 */
export function buildSimVsScreen(
  playerName: string,
  playerHpMax: number,
  result: SimPvpResult,
): string {
  return [
    `⚔️ **DÖVÜŞ BAŞLIYOR!**`,
    ``,
    `🦉 **${playerName}**`,
    hpBar(playerHpMax, playerHpMax),
    ``,
    `**VS**`,
    ``,
    `🦉 **${result.opponent.name}**`,
    hpBar(result.opponent.hpMax, result.opponent.hpMax),
    `> *${result.opponent.species}*`,
  ].join('\n');
}

/**
 * Simüle PvP animasyonu — interaction versiyonu.
 */
export async function animateSimPvPInteraction(
  interaction: { editReply: Function },
  playerId: string,
  playerName: string,
  playerHpMax: number,
  result: SimPvpResult,
): Promise<void> {
  const battleData = buildSimBattleData(playerId, playerName, playerHpMax, result);
  const frames = compressBattleLog(result.events, 3);

  // VS ekranı hemen göster
  await interaction.editReply({
    content: buildSimVsScreen(playerName, playerHpMax, result),
    components: [],
  });
  await sleep(300);

  for (const event of frames) {
    await sleep(150);
    await interaction.editReply({ content: buildBattleFrame(event, battleData) }).catch(() => null);
  }

  await sleep(200);
  await interaction.editReply({ content: buildSimResultScreen(result, playerName) }).catch(() => null);
}

/**
 * Simüle PvP animasyonu — message versiyonu.
 */
export async function animateSimPvPMessage(
  sent: { edit: Function },
  playerId: string,
  playerName: string,
  playerHpMax: number,
  result: SimPvpResult,
): Promise<void> {
  const battleData = buildSimBattleData(playerId, playerName, playerHpMax, result);
  const frames = compressBattleLog(result.events, 3);

  await sent.edit({
    content: buildSimVsScreen(playerName, playerHpMax, result),
    components: [],
  });
  await sleep(300);

  for (const event of frames) {
    await sleep(150);
    await sent.edit({ content: buildBattleFrame(event, battleData) }).catch(() => null);
  }

  await sleep(200);
  await sent.edit({ content: buildSimResultScreen(result, playerName) }).catch(() => null);
}

/**
 * Simüle PvP sonuç ekranı.
 */
function buildSimResultScreen(result: SimPvpResult, playerName: string): string {
  const s = result.streak;
  const lines: string[] = [];

  if (result.playerWon) {
    lines.push(
      `🏆 **${playerName} KAZANDI!**`,
      ``,
      `🥇 ${playerName} — zafer! +${result.xpGained} XP · +${result.coinsGained} 💰`,
      `💀 ${result.opponent.name} — yenildi.`,
      ``,
      `> ⚔️ Toplam tur: **${result.turns}**`,
    );

    // Streak
    lines.push('');
    if (s.newStreak === 1) {
      lines.push(`🔥 Streak başladı! **(1)**`);
    } else {
      lines.push(`🔥 Streak: **${s.newStreak}** *(+1)*`);
    }

    if (s.xpBonusPct > 0 || s.bonusCoins > 0) {
      const parts: string[] = [];
      if (s.xpBonusPct > 0) parts.push(`+${s.xpBonusPct}% XP`);
      if (s.bonusCoins > 0) parts.push(`+${s.bonusCoins} 💰`);
      lines.push(`📈 Streak bonusu: **${parts.join(' · ')}**`);
    }

    if (s.isNewRecord) {
      lines.push(`🏅 **Yeni rekor! En yüksek streak: ${s.bestStreak}**`);
    }

    if (s.milestoneMsg) {
      lines.push(``, `> ${s.milestoneMsg}`);
    }
  } else {
    lines.push(
      `💀 **${result.opponent.name} KAZANDI!**`,
      ``,
      `🥇 ${result.opponent.name} — zafer!`,
      `💀 ${playerName} — yenildi. +${result.xpGained} XP`,
      ``,
      `> ⚔️ Toplam tur: **${result.turns}**`,
    );

    if (s.oldStreak >= 3) {
      lines.push(``, `💔 **${s.oldStreak}** streak bozuldu!`);
    }
  }

  return lines.join('\n');
}

// buildBattleFrame ve sleep fonksiyonlarına erişim için — bu dosyada zaten tanımlı
