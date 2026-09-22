import type { PrismaClient } from '@prisma/client';
import {
  formatUseId,
  looksLikeItemUseId,
  normalizeUseId,
  resolveItemNameFromUseId,
} from './use-items';
import { validateMarketSellerNote } from './market-seller-note';
import { isSafePositiveEconomyAmount } from './safe-economy-amount';

function splitArgs(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/** Sondaki tırnaklı notu ayırır: `sell owl id 1000 "Duel için."` */
export function stripTrailingQuotedNote(args: string[]): {
  cleanArgs: string[];
  sellerNote: string | null;
} {
  if (args.length === 0) return { cleanArgs: args, sellerNote: null };
  const text = args.join(' ').trim();
  const m = text.match(/^(.*)\s+"([^"]*)"\s*$/);
  if (m && m[1]!.trim()) {
    const note = validateMarketSellerNote(m[2]);
    return { cleanArgs: splitArgs(m[1]!), sellerNote: note };
  }
  return { cleanArgs: args, sellerNote: null };
}

/**
 * Satıcı notunu ayırır:
 * `--note "metin"` · `--note metin` · `not ...` · `not:...` · sondaki `"tırnaklı not"`
 */
export function extractSellerNoteFromArgs(args: string[]): {
  cleanArgs: string[];
  sellerNote: string | null;
} {
  if (args.length === 0) return { cleanArgs: args, sellerNote: null };
  const text = args.join(' ').trim();

  const quotedFlag = text.match(/^(.*?)\s+--note\s+"([^"]*)"\s*$/i);
  if (quotedFlag && quotedFlag[1]!.trim()) {
    return {
      cleanArgs: splitArgs(quotedFlag[1]!),
      sellerNote: validateMarketSellerNote(quotedFlag[2]),
    };
  }

  const bareFlag = text.match(/^(.*?)\s+--note\s+(.+)$/i);
  if (bareFlag && bareFlag[1]!.trim()) {
    return {
      cleanArgs: splitArgs(bareFlag[1]!),
      sellerNote: validateMarketSellerNote(bareFlag[2]),
    };
  }

  const turkishColon = text.match(/^(.*?)\s+not:(.+)$/i);
  if (turkishColon && turkishColon[1]!.trim()) {
    return {
      cleanArgs: splitArgs(turkishColon[1]!),
      sellerNote: validateMarketSellerNote(turkishColon[2]),
    };
  }

  const turkishBare = text.match(/^(.*?)\s+not\s+(.+)$/i);
  if (turkishBare && turkishBare[1]!.trim()) {
    return {
      cleanArgs: splitArgs(turkishBare[1]!),
      sellerNote: validateMarketSellerNote(turkishBare[2]),
    };
  }

  return stripTrailingQuotedNote(args);
}

const PRICE_KEY_RE = /^fiyat:?$/i;
const QTY_KEY_RE = /^(adet|miktar):?$/i;

function readKeyedNumber(token: string, key: string): number | null {
  const lower = token.toLowerCase();
  if (lower === key) return null;
  const prefix = `${key}:`;
  if (!lower.startsWith(prefix)) return null;
  const n = parseInt(token.slice(prefix.length), 10);
  return isSafePositiveEconomyAmount(n) ? n : null;
}

function parseMarketSellKeywordArgs(
  args: string[],
): { itemNameRaw: string; quantity: number; price: number } | null {
  if (args.length < 2) return null;

  const hasKeyword = args.some(
    (a) => PRICE_KEY_RE.test(a) || QTY_KEY_RE.test(a) || /^fiyat:\d+$/i.test(a) || /^(adet|miktar):\d+$/i.test(a),
  );
  if (!hasKeyword) return null;

  let price: number | null = null;
  let quantity = 1;
  let firstKeywordIdx = args.length;

  for (let i = 0; i < args.length; i++) {
    const raw = args[i]!;
    const lower = raw.toLowerCase();

    if (PRICE_KEY_RE.test(lower)) {
      firstKeywordIdx = Math.min(firstKeywordIdx, i);
      const next = parseInt(args[i + 1] ?? '', 10);
      if (isSafePositiveEconomyAmount(next) && String(next) === args[i + 1]) {
        price = next;
        i++;
      }
      continue;
    }

    const inlinePrice = readKeyedNumber(raw, 'fiyat');
    if (inlinePrice != null) {
      price = inlinePrice;
      firstKeywordIdx = Math.min(firstKeywordIdx, i);
      continue;
    }

    if (QTY_KEY_RE.test(lower)) {
      firstKeywordIdx = Math.min(firstKeywordIdx, i);
      const next = parseInt(args[i + 1] ?? '', 10);
      if (isSafePositiveEconomyAmount(next) && String(next) === args[i + 1]) {
        quantity = next;
        i++;
      }
      continue;
    }

    const inlineQty = readKeyedNumber(raw, 'adet') ?? readKeyedNumber(raw, 'miktar');
    if (inlineQty != null) {
      quantity = inlineQty;
      firstKeywordIdx = Math.min(firstKeywordIdx, i);
    }
  }

  if (price == null) return null;

  const itemNameRaw = args.slice(0, firstKeywordIdx).join(' ').trim();
  if (!itemNameRaw) return null;

  return { itemNameRaw, quantity, price };
}

function parseMarketSellCompactArgs(
  args: string[],
): { itemNameRaw: string; quantity: number; price: number } | null {
  if (args.length < 2) return null;

  const last = args[args.length - 1]!;
  const combo = last.match(/^(\d+)[x@](\d+)$/i);
  if (!combo) return null;

  const quantity = parseInt(combo[1]!, 10);
  const price = parseInt(combo[2]!, 10);
  if (!isSafePositiveEconomyAmount(quantity) || !isSafePositiveEconomyAmount(price)) {
    return null;
  }

  const itemNameRaw = args.slice(0, -1).join(' ').trim();
  if (!itemNameRaw) return null;

  return { itemNameRaw, quantity, price };
}

/** `owl A1B2 50000` · `owl A1B2 fiyat 50000` */
export function parseOwlMarketSellArgs(
  args: string[],
): { owlIdInput: string; price: number } | null {
  if (args.length < 2) return null;

  const fiyatIdx = args.findIndex(
    (a) => PRICE_KEY_RE.test(a) || /^fiyat:\d+$/i.test(a),
  );
  if (fiyatIdx >= 0) {
    const owlIdInput = args.slice(0, fiyatIdx).join(' ').trim();
    const token = args[fiyatIdx]!;
    const inlinePrice = readKeyedNumber(token, 'fiyat');
    const price = inlinePrice ?? parseInt(args[fiyatIdx + 1] ?? '', 10);
    if (owlIdInput && isSafePositiveEconomyAmount(price)) {
      return { owlIdInput, price };
    }
    return null;
  }

  const price = parseInt(args[args.length - 1] ?? '', 10);
  const owlIdInput = args.length >= 2 ? args.slice(0, -1).join(' ').trim() : args[0] ?? '';
  if (owlIdInput && isSafePositiveEconomyAmount(price)) {
    return { owlIdInput, price };
  }
  return null;
}

export function formatMarketSellUsageHelp(prefix: string): string {
  const p = prefix;
  return [
    `Kullanım: \`${p} sat <eşya-id> fiyat <coin>\``,
    `Örn: \`${p} sat 001 fiyat 8000\` · \`${p} sat owl <id> fiyat 50000\``,
    `Menü: \`${p} sat\` veya \`${p} market\` → Satışa Çıkar butonu`,
  ].join('\n');
}

/**
 * market sell argümanları.
 * ID: `013 [miktar] <fiyat>` veya `021 5 1000`
 * İsim (geri uyum): `Sessizlik Teli 1 1000` — sondan okunur.
 */
export function parseMarketSellItemArgs(
  args: string[],
): { itemNameRaw: string; quantity: number; price: number } | null {
  if (args.length < 1) return null;

  const keyword = parseMarketSellKeywordArgs(args);
  if (keyword) return keyword;

  const compact = parseMarketSellCompactArgs(args);
  if (compact) return compact;

  if (args.length >= 2 && looksLikeItemUseId(args[0]!)) {
    const price = parseInt(args[args.length - 1]!, 10);
    if (!isSafePositiveEconomyAmount(price)) return null;

    let quantity = 1;
    if (args.length >= 3) {
      const maybeQty = parseInt(args[args.length - 2]!, 10);
      if (
        isSafePositiveEconomyAmount(maybeQty) &&
        String(maybeQty) === args[args.length - 2]
      ) {
        quantity = maybeQty;
      }
    }

    return { itemNameRaw: args[0]!.trim(), quantity, price };
  }

  const price = parseInt(args[args.length - 1]!, 10);
  if (!isSafePositiveEconomyAmount(price)) return null;

  let quantity = 1;
  let nameEnd = args.length - 1;

  if (args.length >= 3) {
    const maybeQty = parseInt(args[args.length - 2]!, 10);
    if (
      isSafePositiveEconomyAmount(maybeQty) &&
      String(maybeQty) === args[args.length - 2]
    ) {
      quantity = maybeQty;
      nameEnd = args.length - 2;
    }
  }

  const itemNameRaw = args.slice(0, nameEnd).join(' ').trim();
  if (!itemNameRaw) return null;

  return { itemNameRaw, quantity, price };
}

/** Envanterde tam eşya adını çöz (büyük/küçük harf duyarsız). */
export async function resolveInventoryItemName(
  prisma: PrismaClient,
  ownerId: string,
  input: string,
): Promise<string> {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Eşya adı belirtmelisin.');

  const items = await prisma.inventoryItem.findMany({ where: { ownerId } });
  if (items.length === 0) throw new Error('Envanterin boş.');

  const lower = trimmed.toLowerCase();
  const exact = items.find((i) => i.itemName.toLowerCase() === lower);
  if (exact) return exact.itemName;

  const starts = items.filter((i) => i.itemName.toLowerCase().startsWith(lower));
  if (starts.length === 1) return starts[0]!.itemName;

  const includes = items.filter((i) => i.itemName.toLowerCase().includes(lower));
  if (includes.length === 1) return includes[0]!.itemName;

  if (starts.length > 1 || includes.length > 1) {
    throw new Error(
      `"**${trimmed}**" birden fazla eşyayla eşleşiyor — tam adı yaz. (\`w inventory\`)`,
    );
  }

  throw new Error(
    `"**${trimmed}**" envanterinde yok. Tam adı \`w inventory\` ile kontrol et.`,
  );
}

/** useId veya isim ile envanterdeki eşyayı çöz. */
export async function resolveInventoryItemRef(
  prisma: PrismaClient,
  ownerId: string,
  input: string,
): Promise<string> {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Eşya ID veya adı belirtmelisin.');

  const byId = resolveItemNameFromUseId(trimmed);
  if (byId) {
    const inv = await prisma.inventoryItem.findUnique({
      where: { ownerId_itemName: { ownerId, itemName: byId } },
    });
    if (!inv) {
      throw new Error(
        `Envanterinde **${byId}** yok (ID: \`${formatUseId(normalizeUseId(trimmed))}\`). \`w inventory\` ile kontrol et.`,
      );
    }
    return byId;
  }

  return resolveInventoryItemName(prisma, ownerId, trimmed);
}
