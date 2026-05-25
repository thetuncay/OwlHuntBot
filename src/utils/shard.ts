/**
 * shard.ts — Shard yardımcı fonksiyonları
 *
 * Bu modül hem shard-manager.ts hem de index.ts tarafından kullanılabilir.
 * Döngüsel bağımlılık oluşturmamak için bağımsız bir utility dosyasıdır.
 */

/**
 * Mevcut process'in shard 0 olup olmadığını döndürür.
 * ShardingManager tarafından spawn edilen her shard SHARD_ID ortam değişkenini alır.
 * Shard 0 veya ShardingManager olmadan çalışıyorsa (geliştirme modu) true döner.
 */
export function isShard0(): boolean {
  const shardId = process.env.SHARD_ID;
  return shardId === '0' || shardId === undefined;
}
