import { describe, expect, it } from 'vitest';
import {
  foldTrAscii,
  normalizeCommandToken,
  resolveLegacyAlias,
  resolvePrefixCommandText,
  stripGluedPrefix,
} from '../utils/alias-command';
import { resolveOwlSubcommand } from '../commands/owl-utils';
import { buildHelpEmbed } from '../commands/owl-help';

describe('foldTrAscii', () => {
  it('folds Turkish diacritics for EN keyboard', () => {
    expect(foldTrAscii('yardım')).toBe('yardim');
    expect(foldTrAscii('YARDIM')).toBe('yardim');
    expect(foldTrAscii('parçala')).toBe('parcala');
    expect(foldTrAscii('PARÇALA')).toBe('parcala');
    expect(foldTrAscii('aç')).toBe('ac');
    expect(foldTrAscii('görevler')).toBe('gorevler');
  });
});

describe('resolvePrefixCommandText', () => {
  it('ignores normal words that start with short prefix w', () => {
    expect(resolvePrefixCommandText('what', 'w')).toBeNull();
    expect(resolvePrefixCommandText('when are we playing', 'w')).toBeNull();
    expect(resolvePrefixCommandText('wow nice', 'w')).toBeNull();
  });

  it('accepts spaced prefix and glued owl shortcuts', () => {
    expect(resolvePrefixCommandText('w hunt', 'w')).toBe('hunt');
    expect(resolvePrefixCommandText('w s', 'w')).toBe('s');
    expect(resolvePrefixCommandText('wh', 'w')).toBe('h');
    expect(resolvePrefixCommandText('wdaily', 'w')).toBe('daily');
    expect(resolvePrefixCommandText('owl yardim', 'w')).toBe('yardim');
    expect(resolvePrefixCommandText('owl yardım', 'w')).toBe('yardım');
  });

  it('returns empty string when only prefix is typed', () => {
    expect(resolvePrefixCommandText('w', 'w')).toBeNull();
    expect(resolvePrefixCommandText('w ', 'w')).toBe('');
    expect(resolvePrefixCommandText('  w ', 'w')).toBe('');
  });
});

describe('stripGluedPrefix', () => {
  it('splits common glued commands after short guild prefix', () => {
    expect(stripGluedPrefix('wh', 'w')).toBe('h');
    expect(stripGluedPrefix('wb', 'w')).toBe('b');
    expect(stripGluedPrefix('ws', 'w')).toBe('sell');
    expect(stripGluedPrefix('wbj', 'w')).toBe('bj');
    expect(stripGluedPrefix('wcash', 'w')).toBe('cash');
    expect(stripGluedPrefix('wdaily', 'w')).toBe('daily');
    expect(stripGluedPrefix('wyardim', 'w')).toBe('yardim');
    expect(stripGluedPrefix('wk', 'w')).toBe('k');
    expect(stripGluedPrefix('wk buff', 'w')).toBe('k buff');
  });
});

describe('normalizeCommandToken', () => {
  it('maps legacy aliases to OwlHunt intents', () => {
    expect(normalizeCommandToken('wh')).toBe('hunt');
    expect(normalizeCommandToken('wb')).toBe('duel');
    expect(normalizeCommandToken('wbj')).toBe('bj');
    expect(normalizeCommandToken('battle')).toBe('duel');
    expect(normalizeCommandToken('daily')).toBe('daily');
    expect(normalizeCommandToken('wq')).toBe('quest');
    expect(normalizeCommandToken('pray')).toBe('katalog');
    expect(normalizeCommandToken('k')).toBe('katalog');
    expect(normalizeCommandToken('wk')).toBe('katalog');
  });

  it('resolveLegacyAlias returns null for unsupported commands', () => {
    expect(resolveLegacyAlias('sacrifice')).toBeNull();
    expect(resolveLegacyAlias('huntbot')).toBeNull();
  });
});

describe('resolveSubcommand chain', () => {
  it('produces final handler keys for metalab top prefixes', () => {
    expect(resolveOwlSubcommand('h')).toBe('hunt');
    expect(resolveOwlSubcommand('b')).toBe('duel');
    expect(resolveOwlSubcommand('s')).toBe('slot');
    expect(resolveOwlSubcommand('ah')).toBe('hunt');
    expect(resolveOwlSubcommand('shop')).toBe('market');
    expect(resolveOwlSubcommand('wbj')).toBe('bj');
    expect(resolveOwlSubcommand('ws')).toBe('sell');
    expect(resolveOwlSubcommand('k')).toBe('katalog');
    expect(resolveOwlSubcommand('wk')).toBe('katalog');
    expect(resolveOwlSubcommand('wdaily')).toBe('daily');
    expect(resolveOwlSubcommand('wq')).toBe('quest');
    expect(resolveOwlSubcommand('wd')).toBe('quest');
  });

  it('accepts TR and ASCII spellings for yardim / parçala', () => {
    expect(resolveOwlSubcommand('yardim')).toBe('yardim');
    expect(resolveOwlSubcommand('yardım')).toBe('yardim');
    expect(resolveOwlSubcommand('YARDIM')).toBe('yardim');
    expect(resolveOwlSubcommand('parcala')).toBe('dismantle');
    expect(resolveOwlSubcommand('parçala')).toBe('dismantle');
    expect(resolveOwlSubcommand('PARÇALA')).toBe('dismantle');
    expect(resolveOwlSubcommand('aç')).toBe('aç');
    expect(resolveOwlSubcommand('ac')).toBe('aç');
    expect(resolveOwlSubcommand('gorevler')).toBe('quest');
    expect(resolveOwlSubcommand('görevler')).toBe('quest');
  });
});

describe('help topics TR/ASCII', () => {
  it('resolves esya / eşya and ipucu variants', () => {
    expect(buildHelpEmbed('w', 'esya').data.title).toContain('Eşya');
    expect(buildHelpEmbed('w', 'eşya').data.title).toContain('Eşya');
    expect(buildHelpEmbed('w', 'ipuclari').data.title).toContain('İpuç');
    expect(buildHelpEmbed('w', 'ipuçları').data.title).toContain('İpuç');
  });
});
