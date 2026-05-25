/**
 * audit.ts — AuditLog yazma, geri alma ve temizleme yardımcıları
 *
 * Neden gerekli:
 *   Oyuncu verisi üzerinde yapılan kritik işlemlerin (hunt, pvp, upgrade vb.)
 *   kaydını tutar. Yönetici `/admin undo` komutu ile son işlemi geri alabilir.
 *   30 günden eski kayıtlar periyodik olarak temizlenir.
 *
 * Kullanım:
 *   // İşlem öncesi ve sonrası durumu kaydet
 *   await writeAudit(prisma, playerId, 'hunt', beforeState, afterState);
 *
 *   // Son işlemi geri al
 *   const { action, restoredState } = await undoLastAction(prisma, playerId);
 *
 *   // Eski kayıtları temizle (cron job'da çağrılır)
 *   const deletedCount = await cleanupOldAuditLogs(prisma);
 */

import type { PrismaClient } from '@prisma/client';

export interface AuditEntry {
  playerId: string;
  action: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

/**
 * AuditLog tablosuna yeni bir kayıt yazar.
 * Hunt, PvP, upgrade gibi kritik işlemlerden sonra çağrılır.
 *
 * @param prisma  - Prisma client instance
 * @param playerId - İşlemi yapan oyuncunun ID'si
 * @param action   - İşlem adı (örn. "hunt", "pvp", "upgrade")
 * @param before   - İşlem öncesi oyuncu durumu
 * @param after    - İşlem sonrası oyuncu durumu
 */
export async function writeAudit(
  prisma: PrismaClient,
  playerId: string,
  action: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      playerId,
      action,
      before: before as object,
      after: after as object,
    },
  });
}

/**
 * Oyuncunun en son AuditLog kaydını bulur ve `before` durumunu geri yükler.
 * Yönetici `/admin undo` komutu tarafından kullanılır.
 *
 * @param prisma   - Prisma client instance
 * @param playerId - Geri alma yapılacak oyuncunun ID'si
 * @returns        - Geri alınan işlem adı ve yüklenen önceki durum
 * @throws         - Geri alınacak kayıt yoksa hata fırlatır
 */
export async function undoLastAction(
  prisma: PrismaClient,
  playerId: string,
): Promise<{ action: string; restoredState: Record<string, unknown> }> {
  const lastEntry = await prisma.auditLog.findFirst({
    where: { playerId },
    orderBy: { createdAt: 'desc' },
  });

  if (!lastEntry) {
    throw new Error('Geri alınacak işlem bulunamadı');
  }

  const before = lastEntry.before as Record<string, unknown>;

  await prisma.player.update({
    where: { id: playerId },
    data: before as any,
  });

  return {
    action: lastEntry.action,
    restoredState: before,
  };
}

/**
 * 30 günden eski AuditLog kayıtlarını siler.
 * Periyodik cron job tarafından çağrılır.
 *
 * @param prisma - Prisma client instance
 * @returns      - Silinen kayıt sayısı
 */
export async function cleanupOldAuditLogs(prisma: PrismaClient): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const result = await prisma.auditLog.deleteMany({
    where: {
      createdAt: {
        lt: cutoff,
      },
    },
  });

  return result.count;
}
