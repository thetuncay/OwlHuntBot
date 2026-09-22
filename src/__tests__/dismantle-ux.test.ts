import { describe, expect, it } from 'vitest';
import {
  buildBulkDismantleMessage,
  buildDismantleOwnedMessage,
  buildDismantleStatMessage,
  buildSingleDismantleMessage,
  formatProducedMaterials,
  DISMANTLEABLE_PREY,
} from '../utils/dismantle-ux';

describe('dismantle-ux', () => {
  it('formats bulk dismantle like reference layout', () => {
    const text = buildBulkDismantleMessage(
      [
        { itemName: 'fare', quantity: 11 },
        { itemName: 'yarasa', quantity: 3 },
      ],
      [
        { itemName: 'Kemik Tozu', quantity: 53 },
        { itemName: 'Parlak Tüy', quantity: 43 },
        { itemName: 'Sessizlik Teli', quantity: 5 },
      ],
    );

    expect(text.startsWith('**Toplu Parçalama**')).toBe(true);
    expect(text).toContain('**11x fare**');
    expect(text).toContain('**3x yarasa**');
    expect(text).toContain('**Elde edilen:**');
    expect(text).toContain('**53x Kemik Tozu**');
    expect(text).toContain('**43x Parlak Tüy**');
    expect(text).toContain('**5x Sessizlik Teli**');
  });

  it('sorts produced materials by quantity desc', () => {
    const line = formatProducedMaterials([
      { itemName: 'Parlak Tüy', quantity: 10 },
      { itemName: 'Kemik Tozu', quantity: 50 },
    ]);
    expect(line.indexOf('Kemik Tozu')).toBeLessThan(line.indexOf('Parlak Tüy'));
  });

  it('formats single dismantle output', () => {
    const text = buildSingleDismantleMessage('fare', 2, [{ itemName: 'Kemik Tozu', quantity: 2 }]);
    expect(text).toContain('**2x fare**');
    expect(text).toContain('**Elde edilen:**');
    expect(text).toContain('**2x Kemik Tozu**');
  });

  it('lists only owned dismantleable prey', () => {
    const text = buildDismantleOwnedMessage(
      [
        { itemName: 'fare', quantity: 11 },
        { itemName: 'yarasa', quantity: 3 },
      ],
      'w',
    );
    expect(text).toContain('**PARÇALANABİLİR AVLAR**');
    expect(text).toContain('**fare** ×11');
    expect(text).toContain('**yarasa** ×3');
    expect(text).not.toContain('sincap');
    expect(text).not.toContain('Kemik Tozu (1)');
    expect(text).toContain('`w parçala all`');
    expect(text).toContain('`w parçala stat`');
  });

  it('shows a dash when the player owns no dismantleable prey', () => {
    const text = buildDismantleOwnedMessage([], 'w');
    expect(text).toContain('**PARÇALANABİLİR AVLAR**');
    expect(text).toContain('  —');
    expect(text).not.toContain('fare →');
  });

  it('formats the full recipe table for parçala stat', () => {
    const text = buildDismantleStatMessage();
    expect(text).toContain('fare → Kemik Tozu (1)');
    expect(text).toContain('serce → Parlak Tüy (1)');
    expect(text).toContain('kurbaga → Kemik Tozu (1–2)');
    expect(text).toContain('kertenkele → Kırık Av Zinciri (1)');
    expect(text).toContain('hamster → Kemik Tozu (2–3)');
    expect(text).toContain('kostebek → Av Gözü Kristali (1)');
    expect(text).toContain('yarasa → Sessizlik Teli (1–2)');
    expect(text).toContain('bildircin → Parlak Tüy (3–5)');
    expect(text).toContain('guvercin → Parlak Tüy (3–5)');
    expect(text).toContain('yilan → Yırtıcı Pençe Parçası (1–2)');
    expect(text).toContain('sincap → Parlak Tüy (5–8)');
    expect(text).toContain('tavsan → Yırtıcı Pençe Parçası (2–3)');
    expect(text).toContain('gelincik → Orman Yankısı (1)');
    expect(text).toContain('kirpi → Gölge Tüyü (1)');
    expect(text).toContain('kedi → Kemik Tozu (1–2)');
    expect(text).toContain('kaz → Parlak Tüy (1–2)');
    expect(text).toContain('keci → Kemik Tozu (2–3)');
    expect(text).toContain('kunduz → Kırık Av Zinciri (1)');
    expect(text).toContain('koyun → Parlak Tüy (2–4)');
    expect(text).toContain('tilki → Yırtıcı Pençe Parçası (1–2)');
    expect(text).toContain('sansar → Orman Yankısı (1)');
    expect(text).toContain('kurt → Gölge Tüyü (1)');
    expect(text).toContain('ayi → Gölge Tüyü (1–2)');
    expect(text).not.toContain('×');
    expect(text).not.toContain('PARÇALANABİLİR');
    expect(text.split('\n')).toHaveLength(DISMANTLEABLE_PREY.length);
  });
});
