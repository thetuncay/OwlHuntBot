import { describe, expect, it } from 'vitest';
import {
  allSocialActionNames,
  resolveSocialAction,
  SOCIAL_ACTION_DEFS,
} from '../config/social-actions';
import { formatSocialActionText } from '../systems/social-gifs';

describe('social-actions', () => {
  it('resolves canonical names and aliases', () => {
    expect(resolveSocialAction('kiss')?.id).toBe('kiss');
    expect(resolveSocialAction('punc')?.id).toBe('punch');
    expect(resolveSocialAction('hf')?.id).toBe('highfive');
    expect(resolveSocialAction('nope')).toBeNull();
  });

  it('core ten actions are registered', () => {
    expect(SOCIAL_ACTION_DEFS).toHaveLength(10);
    expect(allSocialActionNames()).toEqual(
      expect.arrayContaining(['kiss', 'hug', 'love', 'punch', 'punc', 'slap', 'pat', 'cuddle', 'wave', 'highfive', 'hf', 'poke']),
    );
  });

  it('templates replace actor and target', () => {
    const def = resolveSocialAction('kiss')!;
    const text = formatSocialActionText(
      { ...def, templates: ['{actor} kissed {target}!'] },
      'Tuncay',
      'Ali',
    );
    expect(text).toBe('Tuncay kissed Ali!');
  });

  it('has no nsfwSources and no nekobot', () => {
    for (const def of SOCIAL_ACTION_DEFS) {
      expect('nsfwSources' in def).toBe(false);
      for (const src of def.sources) {
        expect(src.kind).not.toBe('nekobot');
        if (src.kind === 'nekoslife') {
          expect(['lewd', 'spank', 'hentai', 'anal', 'blowjob']).not.toContain(
            src.category.toLowerCase(),
          );
        }
      }
    }
  });
});
