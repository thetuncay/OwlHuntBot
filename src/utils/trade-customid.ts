/**
 * trade-customid.ts — Trade UI customId encode/decode
 */

export const TRADE_CUSTOM_ID_PREFIX = 'tr:';

const MAX_CUSTOM_ID_LENGTH = 100;

export function isTradeCustomId(customId: string): boolean {
  return customId.startsWith(TRADE_CUSTOM_ID_PREFIX);
}

export function stripTradePrefix(customId: string): string {
  return customId.startsWith(TRADE_CUSTOM_ID_PREFIX)
    ? customId.slice(TRADE_CUSTOM_ID_PREFIX.length)
    : customId;
}

function build(path: string): string {
  const id = `${TRADE_CUSTOM_ID_PREFIX}${path}`;
  if (id.length > MAX_CUSTOM_ID_LENGTH) {
    throw new Error(`Trade customId çok uzun (${id.length})`);
  }
  return id;
}

/** Davet: tr:inv:accept:{inviteId} */
export function buildInviteAcceptId(inviteId: string): string {
  return build(`inv:accept:${inviteId}`);
}

export function buildInviteDeclineId(inviteId: string): string {
  return build(`inv:decline:${inviteId}`);
}

export function buildInviteCancelId(inviteId: string): string {
  return build(`inv:cancel:${inviteId}`);
}

export type TradeBoardAction =
  | 'item'
  | 'coin'
  | 'remove'
  | 'ready'
  | 'cancel'
  | 'confirm'
  | 'abort'
  | 'dismiss';

/** tr:b:{sessionId}:{action} */
export function buildBoardActionId(sessionId: string, action: TradeBoardAction): string {
  return build(`b:${sessionId}:${action}`);
}

export function buildRemoveSelectId(sessionId: string): string {
  return build(`s:rm:${sessionId}`);
}

export function buildRemoveOwlSelectId(sessionId: string): string {
  return build(`s:rmo:${sessionId}`);
}

export function buildCoinModalId(sessionId: string): string {
  return build(`m:coin:${sessionId}`);
}

/** Grid item: tr:pick:{sid}:{absIndex} */
export function buildPickItemId(sessionId: string, absIndex: number): string {
  return build(`pick:${sessionId}:${absIndex}`);
}

/** Grid sayfa: tr:pp:{sid}:{page} */
export function buildPickPageId(sessionId: string, page: number): string {
  return build(`pp:${sessionId}:${page}`);
}

/** Kategori: tr:pc:{sid}:{cat} */
export function buildPickCatId(sessionId: string, cat: string): string {
  return build(`pc:${sessionId}:${cat}`);
}

/** Qty: tr:qty:{sid}:{absIndex}:{n|max|custom} */
export function buildPickQtyId(
  sessionId: string,
  absIndex: number,
  amount: number | 'max' | 'custom',
): string {
  return build(`qty:${sessionId}:${absIndex}:${amount}`);
}

/** Qty modal: tr:m:pqty:{sid}:{absIndex} */
export function buildPickQtyModalId(sessionId: string, absIndex: number): string {
  return build(`m:pqty:${sessionId}:${absIndex}`);
}

export function parsePickQty(
  customId: string,
): { sessionId: string; absIndex: number; amount: number | 'max' | 'custom' } | null {
  const raw = stripTradePrefix(customId);
  const m = /^qty:([a-f0-9]+):(\d+):(max|custom|\d+)$/.exec(raw);
  if (!m?.[1] || m[2] == null || !m[3]) return null;
  let amount: number | 'max' | 'custom';
  if (m[3] === 'max') amount = 'max';
  else if (m[3] === 'custom') amount = 'custom';
  else amount = parseInt(m[3], 10);
  return { sessionId: m[1], absIndex: parseInt(m[2], 10), amount };
}

export function parsePickQtyModal(
  customId: string,
): { sessionId: string; absIndex: number } | null {
  const raw = stripTradePrefix(customId);
  const m = /^m:pqty:([a-f0-9]+):(\d+)$/.exec(raw);
  if (!m?.[1] || m[2] == null) return null;
  return { sessionId: m[1], absIndex: parseInt(m[2], 10) };
}

export function parseInviteAction(
  customId: string,
): { action: 'accept' | 'decline' | 'cancel'; inviteId: string } | null {
  const raw = stripTradePrefix(customId);
  const m = /^inv:(accept|decline|cancel):([a-f0-9]+)$/.exec(raw);
  if (!m?.[1] || !m[2]) return null;
  return { action: m[1] as 'accept' | 'decline' | 'cancel', inviteId: m[2] };
}

export function parseBoardAction(
  customId: string,
): { sessionId: string; action: string } | null {
  const raw = stripTradePrefix(customId);
  const m = /^b:([a-f0-9]+):([a-z]+)$/.exec(raw);
  if (!m?.[1] || !m[2]) return null;
  return { sessionId: m[1], action: m[2] };
}

export function parseRemoveSelect(customId: string): { sessionId: string } | null {
  const raw = stripTradePrefix(customId);
  const m = /^s:rm:([a-f0-9]+)$/.exec(raw);
  if (!m?.[1]) return null;
  return { sessionId: m[1] };
}

export function parseRemoveOwlSelect(customId: string): { sessionId: string } | null {
  const raw = stripTradePrefix(customId);
  const m = /^s:rmo:([a-f0-9]+)$/.exec(raw);
  if (!m?.[1]) return null;
  return { sessionId: m[1] };
}

export function parseCoinModal(customId: string): { sessionId: string } | null {
  const raw = stripTradePrefix(customId);
  const m = /^m:coin:([a-f0-9]+)$/.exec(raw);
  if (!m?.[1]) return null;
  return { sessionId: m[1] };
}

export function parsePickItem(
  customId: string,
): { sessionId: string; absIndex: number } | null {
  const raw = stripTradePrefix(customId);
  const m = /^pick:([a-f0-9]+):(\d+)$/.exec(raw);
  if (!m?.[1] || m[2] == null) return null;
  return { sessionId: m[1], absIndex: parseInt(m[2], 10) };
}

export function parsePickPage(
  customId: string,
): { sessionId: string; page: number } | null {
  const raw = stripTradePrefix(customId);
  const m = /^pp:([a-f0-9]+):(\d+)$/.exec(raw);
  if (!m?.[1] || m[2] == null) return null;
  return { sessionId: m[1], page: parseInt(m[2], 10) };
}

export function parsePickCat(
  customId: string,
): { sessionId: string; cat: string } | null {
  const raw = stripTradePrefix(customId);
  const m = /^pc:([a-f0-9]+):([a-z]+)$/.exec(raw);
  if (!m?.[1] || !m[2]) return null;
  return { sessionId: m[1], cat: m[2] };
}

/** Qty geri → grid: tr:pg:{sid} */
export function buildPickGridBackId(sessionId: string): string {
  return build(`pg:${sessionId}`);
}

export function parsePickGridBack(customId: string): { sessionId: string } | null {
  const raw = stripTradePrefix(customId);
  const m = /^pg:([a-f0-9]+)$/.exec(raw);
  if (!m?.[1]) return null;
  return { sessionId: m[1] };
}

export function isCoinModal(customId: string): boolean {
  return parseCoinModal(customId) != null;
}
