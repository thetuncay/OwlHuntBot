# Invariants — bozulmaması gerekenler

## Ekonomi ve state

1. **Global profil** — oyuncu coin/owl/inv guild’e bağlı değil; cross-guild aynı state.
2. **Atomic coin** — Redis Lua (`player-state`); race’te çift harcama yok.
3. **Redis-first** — hot path yazımı Redis; PG async persist. Hot path’te rastgele Prisma write ekleme.
4. **Lock sırası** — mevcut ordered locks / `utils/lock.ts` kalıbına uy; yeni kilit eklerken deadlock sırasını belgele.
5. **Yetersiz bakiye** — sessizce 0’a çekme yok; açık hata / reddet.

## Config

6. **Sayılar yalnızca config** — formül/sabit `config.ts` veya `config/*`; handler’a magic number yok.
7. **config.ts’ye logic yok** — sadece veri/sabit export.

## Mimari sınırlar

8. **800 satır** — yeni/değişen dosya aşmasın; 800+ dosyayı büyütmeden önce onay.
9. **Tek paket** — monorepo/crate bölme yok.
10. **Kapsam** — alakasız dosya patch’i yok; AUDIT’te sadece öneri.

## Güvenlik / ops (özet)

11. Admin / `/admin` — ops guild (`GUILD_ID`) + allowlist.
12. Ban + maintenance komut pipeline’da.
13. PM2 / Docker / Prisma migrate — kullanıcı onayı (`.cursor/rules`).
14. Secret / token asla commit veya sohbet log’u.

## AI süreç

15. Implement öncesi memory bank INDEX.
16. Davranış değişince Vitest.
17. Public API JSDoc ≥ 8/10 ([`AI_GUIDELINES.md`](../AI_GUIDELINES.md)).
