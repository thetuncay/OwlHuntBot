import { describe, expect, it } from 'vitest';
import {
  collectAttachmentIds,
  normalizeFeedbackAnswers,
} from '../utils/feedback-validation';

describe('feedback-validation', () => {
  const baseAnswers = {
    play_duration: '1m',
    nps: 8,
    discovery: { choice: 'friend' },
    play_frequency_7d: '3-5',
    device: 'desktop',
    most_fun: 'Av sistemi çok eğlenceli ve sürükleyici.',
    most_boring: 'Bekleme süreleri bazen sıkıcı oluyor ama idare eder.',
    most_useless: 'Şu an için gereksiz bir mod görmüyorum açıkçası.',
    would_change: 'Daha fazla biyom çeşitliliği eklemek isterdim kesinlikle.',
    why_when: 'Arkadaşlarımla rekabet için akşamları oynuyorum genelde.',
    help_sufficient: { likert: 4, text: 'Yeterli' },
    economy_fair: { likert: 3 },
    favorite_mode: 'hunt',
    still_play_3mo: { choice: 'yes' },
  };

  it('normalizes valid full answers', () => {
    const out = normalizeFeedbackAnswers(baseAnswers);
    expect(out.nps).toBe(8);
    expect(out.most_fun).toContain('Av sistemi');
  });

  it('rejects short long_text', () => {
    expect(() => normalizeFeedbackAnswers({ ...baseAnswers, most_fun: 'kısa' })).toThrow();
  });

  it('requires discovery other text', () => {
    expect(() => normalizeFeedbackAnswers({
      ...baseAnswers,
      discovery: { choice: 'other' },
    })).toThrow();
  });

  it('requires still_play reason for maybe', () => {
    expect(() => normalizeFeedbackAnswers({
      ...baseAnswers,
      still_play_3mo: { choice: 'maybe' },
    })).toThrow();
  });

  it('collects attachment ids', () => {
    const answers = normalizeFeedbackAnswers({
      ...baseAnswers,
      text_typos_nonsense: { text: 'typo', attachmentIds: ['a', 'b'] },
    });
    expect(collectAttachmentIds(answers)).toEqual(['a', 'b']);
  });
});
