import { describe, expect, it } from 'vitest';
import {
  findCatalogEntry,
  resolveCatalogSection,
  buildCatalogOverviewEmbed,
  buildCatalogCommandsField,
} from '../utils/catalog-ux';

describe('catalog-ux', () => {
  it('resolves section filters', () => {
    expect(resolveCatalogSection('buff')).toBe('buff');
    expect(resolveCatalogSection('mat')).toBe('materyal');
  });

  it('finds buff and material by id or name', () => {
    expect(findCatalogEntry('001')?.name).toBe('Keskin Nişan');
    expect(findCatalogEntry('021')?.name).toBe('Kemik Tozu');
    expect(findCatalogEntry('av kokusu')?.name).toBe('Av Kokusu');
  });

  it('builds overview embed with commands field and item sections', () => {
    const embed = buildCatalogOverviewEmbed('w', 'all');
    const json = embed.toJSON();
    expect(json.title).toContain('Oyun Kataloğu');
    const commands = json.fields?.find((f) => f.name?.includes('Komutlar'));
    expect(commands?.value).toContain('k buff');
    expect(commands?.value).toContain('k 001');
    expect(json.fields?.length).toBeGreaterThanOrEqual(3);
  });

  it('renders buff section with discord custom emojis', () => {
    const embed = buildCatalogOverviewEmbed('w', 'buff');
    const buffField = embed.toJSON().fields?.find((f) => f.name?.includes('Buff'));
    expect(buffField?.value).toContain('owl_buff_keskin');
  });

  it('includes command hints in commands field', () => {
    const text = buildCatalogCommandsField('w');
    expect(text).toContain('`w k`');
    expect(text).toContain('`w k buff`');
    expect(text).toContain('Sadece av buff');
    expect(text).toContain('Sadece upgrade materyal');
  });
});
