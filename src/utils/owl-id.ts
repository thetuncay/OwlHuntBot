import type { PrismaClient } from '@prisma/client';

/** UUID'nin kısa gösterimi — örn. `A1B2C3D4` */
export function formatShortOwlId(owlId: string): string {
  return owlId.split('-')[0]!.toUpperCase();
}

/**
 * Tam UUID veya kısa prefix ile baykuş bul.
 * Aynı prefix'e sahip birden fazla baykuş varsa hata fırlatır.
 */
export async function resolveOwlByInput(
  prisma: PrismaClient,
  ownerId: string,
  input: string,
) {
  const raw = input.trim();
  if (!raw) return null;

  if (raw.length >= 36) {
    return prisma.owl.findFirst({ where: { id: raw, ownerId } });
  }

  const needle = raw.toLowerCase();
  const owls = await prisma.owl.findMany({ where: { ownerId } });
  const matches = owls.filter((o) => {
    const idLower = o.id.toLowerCase();
    const short = formatShortOwlId(o.id).toLowerCase();
    return idLower.startsWith(needle) || short === needle || short.startsWith(needle);
  });

  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    throw new Error(
      `Belirsiz baykuş ID (**${raw}**). Daha uzun ID gir — \`w owls\` ile kontrol et.`,
    );
  }
  return null;
}
