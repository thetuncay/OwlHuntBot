import type { PrismaClient } from '@prisma/client';

/**
 * market sell argümanları — sondan okunur (boşluklu eşya adları için).
 * `Sessizlik Teli 1 1000` → ad + miktar + fiyat
 * `fare 1000` → ad + fiyat (miktar 1)
 */
export function parseMarketSellItemArgs(
  args: string[],
): { itemNameRaw: string; quantity: number; price: number } | null {
  if (args.length < 1) return null;

  const price = parseInt(args[args.length - 1]!, 10);
  if (!Number.isFinite(price) || price < 1) return null;

  let quantity = 1;
  let nameEnd = args.length - 1;

  if (args.length >= 3) {
    const maybeQty = parseInt(args[args.length - 2]!, 10);
    if (Number.isFinite(maybeQty) && maybeQty >= 1 && String(maybeQty) === args[args.length - 2]) {
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
