/** Prisma `Int` (32-bit signed) üst sınırı — ekonomi girişleri için. */
export const MAX_ECONOMY_AMOUNT = 2_147_483_647;

export function assertSafeEconomyAmount(amount: number, label = 'Miktar'): void {
  if (!Number.isSafeInteger(amount)) {
    throw new Error(`${label} geçersiz.`);
  }
  if (amount > MAX_ECONOMY_AMOUNT) {
    throw new Error(
      `${label} çok büyük (maks. ${MAX_ECONOMY_AMOUNT.toLocaleString('tr-TR')}).`,
    );
  }
}

export function isSafePositiveEconomyAmount(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount >= 1 && amount <= MAX_ECONOMY_AMOUNT;
}
