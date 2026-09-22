import { describe, expect, it } from 'vitest';
import {
  buildBoardActionId,
  buildCoinModalId,
  buildInviteAcceptId,
  buildPickItemId,
  buildPickQtyId,
  isTradeCustomId,
  parseBoardAction,
  parseCoinModal,
  parseInviteAction,
  parsePickItem,
  parsePickQty,
} from '../utils/trade-customid';
import { formatTradeItemLine, toComponentEmoji } from '../utils/trade-emoji';
import { renderTradeBoard, tradeOwlEmptyMessage } from '../utils/trade-screens';
import { resolvePickKey, type TradePickCache } from '../utils/trade-pick-cache';
import type { TradeSession } from '../systems/trade';

describe('trade-customid', () => {
  it('matches tr: prefix', () => {
    expect(isTradeCustomId('tr:b:abc:ready')).toBe(true);
    expect(isTradeCustomId('mk:hub')).toBe(false);
  });

  it('round-trips invite / board / pick / qty', () => {
    expect(parseInviteAction(buildInviteAcceptId('deadbeef'))).toEqual({
      action: 'accept',
      inviteId: 'deadbeef',
    });
    expect(parseBoardAction(buildBoardActionId('aabbcc', 'ready'))).toEqual({
      sessionId: 'aabbcc',
      action: 'ready',
    });
    expect(parseCoinModal(buildCoinModalId('aabbcc'))).toEqual({ sessionId: 'aabbcc' });
    expect(parsePickItem(buildPickItemId('aabbcc', 3))).toEqual({
      sessionId: 'aabbcc',
      absIndex: 3,
    });
    expect(parsePickQty(buildPickQtyId('aabbcc', 2, 'max'))).toEqual({
      sessionId: 'aabbcc',
      absIndex: 2,
      amount: 'max',
    });
    expect(parsePickQty(buildPickQtyId('aabbcc', 2, 5))).toEqual({
      sessionId: 'aabbcc',
      absIndex: 2,
      amount: 5,
    });
    expect(parsePickQty(buildPickQtyId('aabbcc', 2, 'custom'))).toEqual({
      sessionId: 'aabbcc',
      absIndex: 2,
      amount: 'custom',
    });
  });
});

describe('trade-pick-cache', () => {
  it('resolves keys by abs index', () => {
    const cache: TradePickCache = {
      keys: ['Kemik Tozu', 'owl:abc123'],
      cat: 'all',
      page: 0,
    };
    expect(resolvePickKey(cache, 0)).toBe('Kemik Tozu');
    expect(resolvePickKey(cache, 1)).toBe('owl:abc123');
    expect(resolvePickKey(cache, 9)).toBeNull();
  });
});

describe('trade-emoji', () => {
  it('parses custom Discord emoji for select components', () => {
    expect(toComponentEmoji('<:owl_item_kemik:123456789012345678>')).toEqual({
      animated: false,
      name: 'owl_item_kemik',
      id: '123456789012345678',
    });
  });

  it('formats trade lines with an emoji prefix', () => {
    const line = formatTradeItemLine({
      itemName: 'Kemik Tozu',
      itemType: 'Materyal',
      quantity: 12,
    });
    expect(line.startsWith('**')).toBe(false);
    expect(line).toContain('Kemik Tozu');
    expect(line).toContain('×12');
  });
});

describe('trade cancel display', () => {
  it('shows who cancelled', () => {
    const session: TradeSession = {
      id: 'sess01ab',
      phase: 'cancelled',
      a: {
        userId: 'a',
        displayName: 'Efe',
        items: [],
        owls: [],
        coins: 0,
        ready: false,
        confirmed: false,
      },
      b: {
        userId: 'b',
        displayName: 'Tuncay',
        items: [],
        owls: [],
        coins: 0,
        ready: false,
        confirmed: false,
      },
      channelId: 'c',
      messageId: 'm',
      guildId: 'g',
      createdAt: 0,
      updatedAt: 0,
      confirmStartedAt: null,
      flash: null,
      cancelledByName: 'Efe',
    };
    const board = renderTradeBoard(session, 'a');
    expect(board.embed.data.description).toContain('Efe');
    expect(board.embed.data.description).toContain('iptal');
  });
});

describe('trade owl empty copy', () => {
  it('warns for main-only and no owls', () => {
    expect(tradeOwlEmptyMessage({
      tradable: [],
      total: 0,
      mainCount: 0,
      busyCount: 0,
    })).toContain('yok');
    expect(tradeOwlEmptyMessage({
      tradable: [],
      total: 1,
      mainCount: 1,
      busyCount: 0,
    })).toContain('Main');
  });
});

describe('trade ready locks offer buttons', () => {
  function baseSession(readyA: boolean): TradeSession {
    return {
      id: 'sess01ab',
      phase: 'open',
      a: {
        userId: 'a',
        displayName: 'Efe',
        items: [{ itemName: 'Kemik Tozu', itemType: 'Materyal', rarity: 'Common', quantity: 1 }],
        owls: [],
        coins: 0,
        ready: readyA,
        confirmed: false,
      },
      b: {
        userId: 'b',
        displayName: 'Tuncay',
        items: [],
        owls: [],
        coins: 10,
        ready: false,
        confirmed: false,
      },
      channelId: 'c',
      messageId: 'm',
      guildId: 'g',
      createdAt: 0,
      updatedAt: 0,
      confirmStartedAt: null,
      flash: null,
      cancelledByName: null,
    };
  }

  it('hides Ekle/Para/Kaldır while someone is ready', () => {
    const open = renderTradeBoard(baseSession(false), 'a');
    const labelsOpen = open.components[0]!.components.map((c) => (c as { data: { label?: string } }).data.label);
    expect(labelsOpen).toEqual(expect.arrayContaining(['Ekle', 'Para', 'Kaldır', 'Hazır', 'İptal']));

    const locked = renderTradeBoard(baseSession(true), 'a');
    const labelsLocked = locked.components[0]!.components.map((c) => (c as { data: { label?: string } }).data.label);
    expect(labelsLocked).toEqual(['Hazır', 'İptal']);
    expect(locked.embed.data.description).toContain('Teklif kilitli');
  });
});
