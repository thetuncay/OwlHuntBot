/**
 * trade-screens.ts — Trade board + ephemeral item grid panel (seri ekleme)
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  TRADE_ALLOW_OWLS,
  TRADE_MAX_SLOTS,
  TRADE_PANEL_PAGE_SIZE,
  TRADE_QTY_PRESETS,
} from '../config/trade';
import { COIN_EMOJI } from '../config/ui-emojis';
import { renderOwlMoonEmoji } from '../config/custom-emojis';
import type { TradeOwlSlot, TradeSession, TradeSide } from '../systems/trade';
import { hydratePlayerState } from '../state/player-state';
import { COLORS } from './theme';
import {
  buildBoardActionId,
  buildPickCatId,
  buildPickGridBackId,
  buildPickItemId,
  buildPickPageId,
  buildPickQtyId,
  buildRemoveOwlSelectId,
  buildRemoveSelectId,
} from './trade-customid';
import { formatTradeItemLine, tradeItemEmoji, tradeItemSelectEmoji, toComponentEmoji } from './trade-emoji';
import { getOwlPrimaryName } from './owl-display';
import {
  owlPickKey,
  saveTradePickCache,
  type TradePickCat,
  type TradePickCache,
} from './trade-pick-cache';

export interface TradeScreenPayload {
  embed: EmbedBuilder;
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

function statusLine(side: TradeSide, phase: TradeSession['phase']): string {
  if (phase === 'confirming') {
    return side.confirmed ? '✅ Son onay verildi' : '⏳ Son onay bekleniyor';
  }
  if (side.ready) return '✅ Hazır · kilitli';
  return '⏳ Hazır değil';
}

function formatOwlLine(owl: TradeOwlSlot): string {
  const emoji = renderOwlMoonEmoji(owl.tier, owl.moonTier);
  const name = getOwlPrimaryName(owl);
  return `${emoji} **${name}** · T${owl.tier}`;
}

function formatSideBlock(side: TradeSide, phase: TradeSession['phase']): string {
  const lines: string[] = [
    `**${side.displayName}** · ${statusLine(side, phase)}`,
  ];
  const hasItems = side.items.length > 0;
  const hasOwls = (side.owls?.length ?? 0) > 0;
  if (!hasItems && !hasOwls && side.coins <= 0) {
    lines.push('_boş_');
  } else {
    for (const item of side.items) {
      lines.push(formatTradeItemLine(item));
    }
    for (const owl of side.owls ?? []) {
      lines.push(formatOwlLine(owl));
    }
    if (side.coins > 0) {
      lines.push(`${COIN_EMOJI} ${side.coins.toLocaleString('tr-TR')}`);
    }
  }
  return lines.join('\n');
}

function boardButtons(session: TradeSession): ActionRowBuilder<ButtonBuilder> {
  const open = session.phase === 'open';
  /** Bir taraf hazırsa teklif kilidi — ekle/para/kaldır gizlenir. */
  const offerLocked = session.a.ready || session.b.ready;
  const anyOffer =
    session.a.items.length
    + session.b.items.length
    + (session.a.owls?.length ?? 0)
    + (session.b.owls?.length ?? 0)
    > 0;

  const row = new ActionRowBuilder<ButtonBuilder>();
  if (open && !offerLocked) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(buildBoardActionId(session.id, 'item'))
        .setLabel('Ekle')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(buildBoardActionId(session.id, 'coin'))
        .setLabel('Para')
        .setEmoji(COIN_EMOJI)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(buildBoardActionId(session.id, 'remove'))
        .setLabel('Kaldır')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!anyOffer),
    );
  }
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(buildBoardActionId(session.id, 'ready'))
      .setLabel('Hazır')
      .setStyle(offerLocked ? ButtonStyle.Primary : ButtonStyle.Success)
      .setDisabled(!open),
    new ButtonBuilder()
      .setCustomId(buildBoardActionId(session.id, 'cancel'))
      .setLabel('İptal')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(session.phase === 'settled' || session.phase === 'cancelled'),
  );
  return row;
}

function confirmButtons(session: TradeSession): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildBoardActionId(session.id, 'confirm'))
      .setLabel('Son onay')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(buildBoardActionId(session.id, 'abort'))
      .setLabel('Vazgeç')
      .setStyle(ButtonStyle.Danger),
  );
}

/**
 * Ana trade / onay ekranı (public mesaj).
 * @invariant Item satırları özel emoji kullanır.
 */
export function renderTradeBoard(
  session: TradeSession,
  _viewerId: string,
): TradeScreenPayload {
  if (session.phase === 'settled') {
    const embed = new EmbedBuilder()
      .setColor(COLORS.SUCCESS)
      .setTitle('Trade tamamlandı')
      .setDescription(
        [
          formatSideBlock(session.a, 'settled'),
          '',
          formatSideBlock(session.b, 'settled'),
        ].join('\n'),
      );
    return { embed, components: [] };
  }

  if (session.phase === 'cancelled') {
    const who = session.cancelledByName
      ? `**${session.cancelledByName}** trade’i iptal etti.`
      : 'Trade iptal edildi.';
    const embed = new EmbedBuilder()
      .setColor(COLORS.MUTED)
      .setTitle('Trade iptal')
      .setDescription(`${who}\nEşyalar ve coin iade edildi.`);
    return { embed, components: [] };
  }

  if (session.phase === 'confirming') {
    const embed = new EmbedBuilder()
      .setColor(COLORS.WARNING)
      .setTitle('Trade onayı')
      .setDescription(
        [
          session.flash ? `⚠ ${session.flash}` : null,
          `**${session.a.displayName}** verir`,
          session.a.items.length || session.a.owls?.length || session.a.coins
            ? [
                ...session.a.items.map(formatTradeItemLine),
                ...(session.a.owls ?? []).map(formatOwlLine),
                session.a.coins > 0
                  ? `${COIN_EMOJI} ${session.a.coins.toLocaleString('tr-TR')}`
                  : null,
              ].filter(Boolean).join('\n')
            : '_boş_',
          '',
          `**${session.b.displayName}** verir`,
          session.b.items.length || session.b.owls?.length || session.b.coins
            ? [
                ...session.b.items.map(formatTradeItemLine),
                ...(session.b.owls ?? []).map(formatOwlLine),
                session.b.coins > 0
                  ? `${COIN_EMOJI} ${session.b.coins.toLocaleString('tr-TR')}`
                  : null,
              ].filter(Boolean).join('\n')
            : '_boş_',
          '',
          `Onay: **${session.a.displayName}** ${session.a.confirmed ? '✅' : '⏳'} · **${session.b.displayName}** ${session.b.confirmed ? '✅' : '⏳'}`,
        ].filter((l) => l != null).join('\n'),
      );
    return { embed, components: [confirmButtons(session)] };
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.MARKET)
    .setTitle(`Trade · ${session.a.displayName} ↔ ${session.b.displayName}`)
    .setDescription(
      [
        session.flash ? `⚠ ${session.flash}` : null,
        session.a.ready || session.b.ready
          ? '_Teklif kilitli — değiştirmek için hazır olan taraf Hazır’a tekrar bassın._'
          : null,
        formatSideBlock(session.a, session.phase),
        '',
        formatSideBlock(session.b, session.phase),
        '',
        `_Slot: max ${TRADE_MAX_SLOTS} farklı eşya/baykuş / taraf_`,
      ].filter((l) => l != null).join('\n'),
    );

  return { embed, components: [boardButtons(session)] };
}

export interface TradeInvEntry {
  itemName: string;
  itemType: string;
  rarity: string;
  quantity: number;
}

function catOf(itemType: string): TradePickCat {
  switch (itemType) {
    case 'Materyal':
    case 'Material':
      return 'mat';
    case 'Buff':
      return 'buff';
    case 'Av':
      return 'av';
    default:
      return 'other';
  }
}

const CAT_LABEL: Record<TradePickCat, string> = {
  all: 'Tümü',
  mat: 'Materyal',
  buff: 'Buff',
  av: 'Av',
  other: 'Diğer',
  owl: 'Baykuş',
};

export interface TradeOwlEntry {
  owlId: string;
  species: string;
  nickname: string | null;
  tier: number;
  moonTier: number;
  quality: string;
}

type PanelEntry =
  | { kind: 'item'; key: string; item: TradeInvEntry }
  | { kind: 'owl'; key: string; owl: TradeOwlEntry };

/**
 * Oyuncu envanterini Redis-first okur (miktar desc).
 */
export async function loadTradeInventory(
  prisma: PrismaClient,
  redis: Redis,
  userId: string,
): Promise<TradeInvEntry[]> {
  await hydratePlayerState(redis, prisma, userId, { includeInventory: true });
  const hash = await redis.hgetall(`state:inv:${userId}`);
  const rows: TradeInvEntry[] = [];
  for (const [itemName, raw] of Object.entries(hash)) {
    try {
      const parsed = JSON.parse(raw) as { itemType: string; rarity: string; quantity: number };
      if (parsed.quantity > 0) {
        rows.push({
          itemName,
          itemType: parsed.itemType,
          rarity: parsed.rarity,
          quantity: parsed.quantity,
        });
      }
    } catch {
      /* skip */
    }
  }
  rows.sort((a, b) => {
    if (b.quantity !== a.quantity) return b.quantity - a.quantity;
    return a.itemName.localeCompare(b.itemName, 'tr');
  });
  return rows;
}

/** Trade’e konabilir baykuşlar (main / market / trade hariç). */
export async function loadTradableOwls(
  prisma: PrismaClient,
  userId: string,
): Promise<TradeOwlEntry[]> {
  if (!TRADE_ALLOW_OWLS) return [];
  const rows = await prisma.owl.findMany({
    where: {
      ownerId: userId,
      isMain: false,
      passiveMode: 'idle',
    },
    orderBy: [{ tier: 'desc' }, { species: 'asc' }],
    select: {
      id: true,
      species: true,
      nickname: true,
      tier: true,
      moonTier: true,
      quality: true,
    },
  });
  return rows.map((o) => ({
    owlId: o.id,
    species: o.species,
    nickname: o.nickname,
    tier: o.tier,
    moonTier: o.moonTier,
    quality: o.quality,
  }));
}

export interface TradeOwlDiagnostics {
  tradable: TradeOwlEntry[];
  total: number;
  mainCount: number;
  busyCount: number;
}

/** Main / meşgul / trade’e uygun baykuş sayıları. */
export async function loadTradeOwlDiagnostics(
  prisma: PrismaClient,
  userId: string,
): Promise<TradeOwlDiagnostics> {
  if (!TRADE_ALLOW_OWLS) {
    return { tradable: [], total: 0, mainCount: 0, busyCount: 0 };
  }
  const rows = await prisma.owl.findMany({
    where: { ownerId: userId },
    select: {
      id: true,
      species: true,
      nickname: true,
      tier: true,
      moonTier: true,
      quality: true,
      isMain: true,
      passiveMode: true,
    },
  });
  const tradable: TradeOwlEntry[] = [];
  let mainCount = 0;
  let busyCount = 0;
  for (const o of rows) {
    if (o.isMain) {
      mainCount += 1;
      continue;
    }
    if (o.passiveMode !== 'idle') {
      busyCount += 1;
      continue;
    }
    tradable.push({
      owlId: o.id,
      species: o.species,
      nickname: o.nickname,
      tier: o.tier,
      moonTier: o.moonTier,
      quality: o.quality,
    });
  }
  tradable.sort((a, b) => b.tier - a.tier || a.species.localeCompare(b.species, 'tr'));
  return { tradable, total: rows.length, mainCount, busyCount };
}

export function tradeOwlEmptyMessage(diag: TradeOwlDiagnostics): string {
  if (diag.total === 0) {
    return '⚠ Trade’e koyacak baykuşun yok.';
  }
  if (diag.tradable.length > 0) {
    return 'Bu kategoride bir şey yok.';
  }
  if (diag.mainCount > 0 && diag.busyCount === 0) {
    return '⚠ Main baykuş trade’e konamaz. Başka (idle) baykuşun yok.';
  }
  if (diag.mainCount > 0 && diag.busyCount > 0) {
    return '⚠ Main baykuş konamaz; diğerleri market/trade’de meşgul.';
  }
  return '⚠ Uygun baykuş yok (hepsi meşgul).';
}

function shortLabel(name: string, max = 12): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}

/**
 * Ephemeral seri ekleme grid’i (eşya + baykuş).
 */
export async function renderTradeItemPanel(
  prisma: PrismaClient,
  redis: Redis,
  session: TradeSession,
  userId: string,
  opts?: {
    cat?: TradePickCat;
    page?: number;
    flash?: string | null;
  },
): Promise<TradeScreenPayload> {
  const [items, owlDiag] = await Promise.all([
    loadTradeInventory(prisma, redis, userId),
    loadTradeOwlDiagnostics(prisma, userId),
  ]);
  const owls = owlDiag.tradable;

  const presentCats = new Set<TradePickCat>(items.map((i) => catOf(i.itemType)));
  if (TRADE_ALLOW_OWLS && owlDiag.total > 0) presentCats.add('owl');

  let cat: TradePickCat = opts?.cat ?? 'all';
  if (cat !== 'all' && !presentCats.has(cat)) cat = 'all';

  const filtered: PanelEntry[] = [];
  if (cat === 'owl') {
    for (const owl of owls) filtered.push({ kind: 'owl', key: owlPickKey(owl.owlId), owl });
  } else if (cat === 'all') {
    for (const item of items) filtered.push({ kind: 'item', key: item.itemName, item });
    for (const owl of owls) filtered.push({ kind: 'owl', key: owlPickKey(owl.owlId), owl });
  } else {
    for (const item of items.filter((i) => catOf(i.itemType) === cat)) {
      filtered.push({ kind: 'item', key: item.itemName, item });
    }
  }

  const showCats = presentCats.size >= 2 || (presentCats.has('owl') && items.length > 0);
  const totalPages = Math.max(1, Math.ceil(filtered.length / TRADE_PANEL_PAGE_SIZE) || 1);
  const page = Math.min(Math.max(0, opts?.page ?? 0), totalPages - 1);
  const slice = filtered.slice(
    page * TRADE_PANEL_PAGE_SIZE,
    (page + 1) * TRADE_PANEL_PAGE_SIZE,
  );

  const cache: TradePickCache = {
    keys: filtered.map((e) => e.key),
    cat,
    page,
  };
  await saveTradePickCache(redis, session.id, userId, cache);

  const desc: string[] = [];
  if (opts?.flash) desc.push(opts.flash);
  if (filtered.length === 0) {
    if (cat === 'owl') {
      desc.push(tradeOwlEmptyMessage(owlDiag));
    } else if (items.length === 0 && owls.length === 0) {
      desc.push(
        owlDiag.total > 0
          ? `${tradeOwlEmptyMessage(owlDiag)}\nEklenebilir eşya da yok.`
          : 'Eklenebilir eşya/baykuş yok.',
      );
    } else {
      desc.push('Bu kategoride bir şey yok.');
    }
  } else {
    desc.push(`${filtered.length} seçenek · tıkla · ekledikçe panel açık kalır`);
    if (totalPages > 1) desc.push(`Sayfa ${page + 1}/${totalPages}`);
    if (owlDiag.mainCount > 0 && owls.length === 0) {
      desc.push('_Main baykuş trade’e konamaz._');
    }
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.MARKET)
    .setTitle('Eşya / baykuş ekle (sadece sen görürsün)')
    .setDescription(desc.join('\n'));

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  if (showCats) {
    const cats = (['all', 'mat', 'buff', 'av', 'owl', 'other'] as TradePickCat[]).filter(
      (c) => c === 'all' || presentCats.has(c),
    );
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...cats.slice(0, 5).map((c) =>
          new ButtonBuilder()
            .setCustomId(buildPickCatId(session.id, c))
            .setLabel(CAT_LABEL[c])
            .setStyle(c === cat ? ButtonStyle.Primary : ButtonStyle.Secondary),
        ),
      ),
    );
  }

  const maxItemRows = 3;
  const maxItems = maxItemRows * 5;
  const visible = slice.slice(0, maxItems);
  for (let r = 0; r < maxItemRows; r++) {
    const rowEntries = visible.slice(r * 5, r * 5 + 5);
    if (rowEntries.length === 0) break;
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (let i = 0; i < rowEntries.length; i++) {
      const entry = rowEntries[i]!;
      const absIndex = page * TRADE_PANEL_PAGE_SIZE + r * 5 + i;
      if (entry.kind === 'item') {
        const emoji = tradeItemSelectEmoji(entry.item);
        const btn = new ButtonBuilder()
          .setCustomId(buildPickItemId(session.id, absIndex))
          .setLabel(`${shortLabel(entry.item.itemName)} ×${entry.item.quantity}`.slice(0, 80))
          .setStyle(ButtonStyle.Secondary);
        if (emoji) btn.setEmoji(emoji);
        row.addComponents(btn);
      } else {
        const emoji = toComponentEmoji(
          renderOwlMoonEmoji(entry.owl.tier, entry.owl.moonTier),
        );
        const name = getOwlPrimaryName(entry.owl);
        const btn = new ButtonBuilder()
          .setCustomId(buildPickItemId(session.id, absIndex))
          .setLabel(`${shortLabel(name)} T${entry.owl.tier}`.slice(0, 80))
          .setStyle(ButtonStyle.Primary);
        if (emoji) btn.setEmoji(emoji);
        row.addComponents(btn);
      }
    }
    components.push(row);
  }

  const nav: ButtonBuilder[] = [];
  if (totalPages > 1) {
    nav.push(
      new ButtonBuilder()
        .setCustomId(buildPickPageId(session.id, page - 1))
        .setLabel('◀')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 0),
      new ButtonBuilder()
        .setCustomId(buildPickPageId(session.id, page + 1))
        .setLabel('▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1),
    );
  }
  nav.push(
    new ButtonBuilder()
      .setCustomId(buildBoardActionId(session.id, 'dismiss'))
      .setLabel('Kapat')
      .setStyle(ButtonStyle.Secondary),
  );
  components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...nav));

  return { embed, components: components.slice(0, 5) };
}

/**
 * Seçilen item için miktar paneli (modal yok).
 */
export function renderTradeQtyPanel(
  session: TradeSession,
  absIndex: number,
  item: TradeInvEntry,
): TradeScreenPayload {
  const emoji = tradeItemEmoji(item);
  const embed = new EmbedBuilder()
    .setColor(COLORS.MARKET)
    .setTitle('Kaç adet?')
    .setDescription(
      `${emoji} **${item.itemName}**\nElinde: ×${item.quantity.toLocaleString('tr-TR')}`,
    );

  const qtyRow = new ActionRowBuilder<ButtonBuilder>();
  for (const n of TRADE_QTY_PRESETS) {
    qtyRow.addComponents(
      new ButtonBuilder()
        .setCustomId(buildPickQtyId(session.id, absIndex, n))
        .setLabel(String(n))
        .setStyle(ButtonStyle.Primary)
        .setDisabled(n > item.quantity),
    );
  }
  qtyRow.addComponents(
    new ButtonBuilder()
      .setCustomId(buildPickQtyId(session.id, absIndex, 'max'))
      .setLabel(`Max (${item.quantity})`.slice(0, 80))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(buildPickQtyId(session.id, absIndex, 'custom'))
      .setLabel('Özel')
      .setStyle(ButtonStyle.Secondary),
  );

  const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildPickGridBackId(session.id))
      .setLabel('Geri')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildBoardActionId(session.id, 'dismiss'))
      .setLabel('Kapat')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embed, components: [qtyRow, backRow] };
}

/**
 * Ephemeral kaldırıcı (eşya + baykuş).
 */
export function renderTradeRemovePicker(
  session: TradeSession,
  userId: string,
): TradeScreenPayload {
  const side = session.a.userId === userId ? session.a : session.b;
  const owls = side.owls ?? [];
  const total = side.items.length + owls.length;
  const embed = new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle('Kaldır (sadece sen görürsün)')
    .setDescription(
      total === 0
        ? 'Trade teklifinde eşya/baykuş yok.'
        : 'Kaldırmak istediğini seç — tamamı iade edilir.',
    );

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  if (side.items.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(buildRemoveSelectId(session.id))
      .setPlaceholder('Kaldırılacak eşya…')
      .addOptions(
        side.items.map((item) => {
          const emoji = tradeItemSelectEmoji(item);
          return {
            label: `${item.itemName} · ×${item.quantity}`.slice(0, 100),
            description: item.itemType.slice(0, 100),
            value: Buffer.from(item.itemName, 'utf8').toString('base64url').slice(0, 100),
            ...(emoji ? { emoji } : {}),
          };
        }),
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  if (owls.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(buildRemoveOwlSelectId(session.id))
      .setPlaceholder('Kaldırılacak baykuş…')
      .addOptions(
        owls.map((owl) => {
          const emoji = toComponentEmoji(renderOwlMoonEmoji(owl.tier, owl.moonTier));
          const name = getOwlPrimaryName(owl);
          return {
            label: `${name} · T${owl.tier}`.slice(0, 100),
            description: 'Baykuş — trade’den çıkar',
            value: Buffer.from(owl.owlId, 'utf8').toString('base64url').slice(0, 100),
            ...(emoji ? { emoji } : {}),
          };
        }),
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildBoardActionId(session.id, 'dismiss'))
        .setLabel('Kapat')
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return { embed, components };
}

export function decodeItemNameValue(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

/** Coin modal için mevcut + escrow toplamı. */
export async function tradeCoinAvailability(
  redis: Redis,
  prisma: PrismaClient,
  session: TradeSession,
  userId: string,
): Promise<{ available: number; currentOffer: number }> {
  const side = session.a.userId === userId ? session.a : session.b;
  const bundle = await hydratePlayerState(redis, prisma, userId);
  const wallet = bundle?.player.coins ?? 0;
  return {
    available: wallet + side.coins,
    currentOffer: side.coins,
  };
}

/** @internal test / handler — byName lookup */
export function findInvEntry(
  rows: TradeInvEntry[],
  itemName: string,
): TradeInvEntry | undefined {
  return rows.find((r) => r.itemName === itemName);
}
