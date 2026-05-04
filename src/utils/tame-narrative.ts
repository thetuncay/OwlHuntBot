// ─── PERSONALITY SYSTEM ──────────────────────────────────────────────────────
export type OwlPersonality = 'aggressive' | 'timid' | 'curious' | 'greedy' | 'wise';

export interface PersonalityTraits {
  aggression: number;   // 0-100
  awareness:  number;   // 0-100
  patience:   number;   // 0-100
  greed:      number;   // 0-100
}

export interface OwlPersonalityProfile {
  type:   OwlPersonality;
  traits: PersonalityTraits;
  label:  string;
  emoji:  string;
}

export type TameAction = 'silent' | 'distract' | 'advance';
export type TameOutcome = 'success' | 'fail' | 'critical_success' | 'critical_fail' | 'escape';

export interface NarrativeContext {
  personality: OwlPersonality;
  action:      TameAction;
  outcome:     TameOutcome;
  turn:        number;        // 1-4
  progress:    number;        // 0-100
  escapeRisk:  number;        // 0-100
  usedLines:   string[];      // anti-repetition memory
}

export interface NarrativeOutput {
  reaction:    string;
  continuation: string;
  hint:        string;
}

// ─── TEXT POOLS (imported from tame-texts.ts) ────────────────────────────────
import {
  INTRO_TEXTS,
  REACTION_TEXTS,
  SUCCESS_TEXTS,
  FAIL_TEXTS,
  CRITICAL_SUCCESS_TEXTS,
  CRITICAL_FAIL_TEXTS,
  HINT_TEXTS,
  ENDING_TEXTS,
} from './tame-texts';

// ─── PERSONALITY GENERATOR ───────────────────────────────────────────────────
export function rollPersonality(tier: number, quality: string): OwlPersonalityProfile {
  // Tier 1-3 = daha sert kişilikler, Tier 6-8 = daha yumuşak
  const highTier = tier <= 3;
  const pool: OwlPersonality[] = highTier
    ? ['aggressive', 'wise', 'aggressive', 'curious', 'greedy']
    : ['timid', 'curious', 'timid', 'greedy', 'curious'];

  // God Roll / Elite = wise veya aggressive ağırlıklı
  const qualityOverride: Partial<Record<string, OwlPersonality[]>> = {
    'God Roll': ['wise', 'aggressive'],
    'Elite':    ['wise', 'curious'],
    'Trash':    ['timid', 'timid', 'greedy'],
  };
  const finalPool = qualityOverride[quality] ?? pool;
  const type = finalPool[Math.floor(Math.random() * finalPool.length)]!;

  const baseTraits: Record<OwlPersonality, PersonalityTraits> = {
    aggressive: { aggression: 80 + Math.floor(Math.random()*20), awareness: 60 + Math.floor(Math.random()*30), patience: 10 + Math.floor(Math.random()*20), greed: 30 + Math.floor(Math.random()*30) },
    timid:      { aggression: 5  + Math.floor(Math.random()*15), awareness: 70 + Math.floor(Math.random()*30), patience: 50 + Math.floor(Math.random()*30), greed: 10 + Math.floor(Math.random()*20) },
    curious:    { aggression: 20 + Math.floor(Math.random()*30), awareness: 80 + Math.floor(Math.random()*20), patience: 40 + Math.floor(Math.random()*30), greed: 40 + Math.floor(Math.random()*30) },
    greedy:     { aggression: 40 + Math.floor(Math.random()*30), awareness: 50 + Math.floor(Math.random()*30), patience: 20 + Math.floor(Math.random()*30), greed: 80 + Math.floor(Math.random()*20) },
    wise:       { aggression: 30 + Math.floor(Math.random()*20), awareness: 90 + Math.floor(Math.random()*10), patience: 70 + Math.floor(Math.random()*20), greed: 20 + Math.floor(Math.random()*20) },
  };

  const labels: Record<OwlPersonality, string> = {
    aggressive: 'Saldırgan',
    timid:      'Ürkek',
    curious:    'Meraklı',
    greedy:     'Açgözlü',
    wise:       'Bilge',
  };
  const emojis: Record<OwlPersonality, string> = {
    aggressive: '🔴',
    timid:      '🟡',
    curious:    '🔵',
    greedy:     '🟠',
    wise:       '🟣',
  };

  return { type, traits: baseTraits[type], label: labels[type], emoji: emojis[type] };
}

// ─── ANTI-REPETITION ENGINE ───────────────────────────────────────────────────
export function pickUnused(pool: string[], usedLines: string[], maxMemory = 8): string {
  const unused = pool.filter((l) => !usedLines.includes(l));
  const source = unused.length > 0 ? unused : pool;
  return source[Math.floor(Math.random() * source.length)]!;
}

// ─── ACTION BONUS MODIFIERS ───────────────────────────────────────────────────
export const ACTION_MODIFIERS: Record<OwlPersonality, Record<TameAction, number>> = {
  aggressive: { silent: +8,  distract: -12, advance: +5  },
  timid:      { silent: +15, distract: -20, advance: -10 },
  curious:    { silent: -5,  distract: +15, advance: +8  },
  greedy:     { silent: -8,  distract: +10, advance: +5  },
  wise:       { silent: +12, distract: -5,  advance: +3  },
};

// ─── ESCAPE RISK MODIFIERS ────────────────────────────────────────────────────
export const ESCAPE_MODIFIERS: Record<OwlPersonality, Record<TameAction, number>> = {
  aggressive: { silent: -5,  distract: +15, advance: +10 },
  timid:      { silent: -10, distract: +25, advance: +20 },
  curious:    { silent: +5,  distract: -10, advance: -5  },
  greedy:     { silent: +5,  distract: -5,  advance: -8  },
  wise:       { silent: -8,  distract: +5,  advance: +3  },
};

// ─── MAIN TEXT GENERATOR ─────────────────────────────────────────────────────
export function generateNarrative(ctx: NarrativeContext): NarrativeOutput {
  const { personality, action, outcome, turn, usedLines } = ctx;

  // Ultra-rare lines (1% chance)
  const ultraRare: Partial<Record<OwlPersonality, string>> = {
    aggressive: '⚡ *Bir an için gözleri yumuşadı. Sadece bir an. Ama gördün.*',
    timid:      '⚡ *Sana doğru koştu. Kimseye yapmamıştı bunu. Hiç.*',
    curious:    '⚡ *Seninle aynı anda aynı şeye baktınız. Tesadüf değildi.*',
    greedy:     '⚡ *Hiçbir şey istemedi. İlk kez. Bu seni şaşırttı.*',
    wise:       '⚡ *Gözlerini kapattı. Açtı. "Hazırsın" dedi — sözsüz.*',
  };
  if (Math.random() < 0.01 && ultraRare[personality]) {
    return {
      reaction:     ultraRare[personality],
      continuation: '',
      hint:         '',
    };
  }

  // Turn 1 = intro, diğerleri = reaction
  let reaction: string;
  if (turn === 1) {
    reaction = pickUnused(INTRO_TEXTS[personality], usedLines);
  } else {
    reaction = pickUnused(REACTION_TEXTS[personality][action], usedLines);
  }

  // Outcome continuation
  let continuation: string;
  switch (outcome) {
    case 'critical_success':
      continuation = pickUnused(CRITICAL_SUCCESS_TEXTS[personality], usedLines);
      break;
    case 'critical_fail':
      continuation = pickUnused(CRITICAL_FAIL_TEXTS[personality], usedLines);
      break;
    case 'success':
      continuation = pickUnused(SUCCESS_TEXTS[personality], usedLines);
      break;
    case 'fail':
      continuation = pickUnused(FAIL_TEXTS[personality], usedLines);
      break;
    case 'escape':
      continuation = pickUnused(ENDING_TEXTS.fail_escape, usedLines);
      break;
    default:
      continuation = '';
  }

  const hint = pickUnused(HINT_TEXTS[personality], usedLines);

  return { reaction, continuation, hint };
}

// ─── ENDING GENERATOR ────────────────────────────────────────────────────────
export function generateEnding(
  personality: OwlPersonality,
  success: boolean,
  progress: number,
  usedLines: string[],
): string {
  if (!success) {
    const pool = progress > 60
      ? ENDING_TEXTS.fail_tension
      : Math.random() < 0.5
        ? ENDING_TEXTS.fail_escape
        : ENDING_TEXTS.fail_vanish;
    return pickUnused(pool, usedLines);
  }
  // Success ending by personality
  const endingMap: Record<OwlPersonality, 'success_calm' | 'success_emotional' | 'success_dominant'> = {
    aggressive: 'success_dominant',
    timid:      'success_emotional',
    curious:    'success_emotional',
    greedy:     'success_calm',
    wise:       'success_calm',
  };
  return pickUnused(ENDING_TEXTS[endingMap[personality]], usedLines);
}
