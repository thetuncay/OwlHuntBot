# OwlHunt — AI Guidelines (Kanun)

Bu dosya ajanların büyük kod tabanında (~55k satır `src/`) kontrolden çıkmaması için tek kaynak kanundur. Her oturumda tamamını bağlamına gömme; implement öncesi oku, ihlal etme.

Üretim güvenliği (PM2, Docker, Prisma, AUDIT MODE, git snapshot) → [`.cursor/rules/`](../../.cursor/rules/). Burada tekrarlanmaz.

---

## 1. Kapsam disiplini

- Sadece istenen dosya ve davranışa dokun.
- “Yanında şu da bozuk / şu da refactor olur” → **raporla**, uygulama (AUDIT MODE ile uyumlu).
- Kullanıcı açıkça `implement` / `fix` / `uygula` demeden dosya yazma, commit, restart, migrate yok.
- Alakasız “yanında düzelteyim” patch’leri yasak.

## 2. Dosya boyutu (800 satır)

- Yeni veya bu turda değişen dosya **800 satırı geçmesin**.
- Zaten 800+ olan dosyayı **büyütme**. Bölmeden veya kullanıcı onayından önce satır ekleme.
- Bilinen büyük dosyalar (bilinçli; bu turda bölme zorunlu değil):
  - `src/config.ts` — sayı kataloğu (god object değil)
  - `src/commands/admin.ts`, `src/state/player-state.ts`
  - `src/systems/market.ts`, `src/utils/market-screens.ts`
  - `src/commands/pvp.ts`, `src/utils/pvp-ux.ts`

## 3. Modüler mimari

- Yeni sistem → `src/systems/<konu>.ts` (veya mevcut alt klasör: `gamble/`, `retention/`, `ai/`).
- Handler ince kalsın: `src/commands/*` Discord I/O; iş mantığı `systems` / `state` / `utils`.
- **Tek npm paketi** kalır. Ayrı package/crate monorepo = over-engineering, yasak (OwlHunt ölçeğinde).
- God-object / global mutable singleton ekleme (`G` tarzı çorba yok).

## 4. Sayılar ve config

- Oyun sabitleri, formüller, tier tabloları yalnızca `src/config.ts` veya `src/config/*`.
- Logic / Discord handler’ı `config.ts` içine **ekleme**.
- Magic number’ı command/system dosyasına gömme.

## 5. Hot path ve ekonomi

- Hunt / coin / XP / stamina yazımı: Redis + Lua + `src/utils/db-queue.ts` persist kuyruğu.
- Komut hot path’inde doğrudan Prisma yazımı yok (hydrate / arka plan / admin-ops hariç mevcut kalıplar).
- Kritik yollarda mevcut Redis lock / ordered locks (`src/utils/lock.ts`) kullan; lock’suz ekonomi mutasyonu yasak.

## 6. TypeScript yasakları (yeni / değişen kod)

| Yasak | Not |
|-------|-----|
| `any`, `as any` | Test mock’larında dar istisna |
| `@ts-ignore` / `@ts-expect-error` | Gerçek tip düzeltmesi tercih |
| `eslint-disable` yığma | Tek satır, gerekçeli |
| `JSON.parse(JSON.stringify(...))` | Gereksiz deep clone; structuredClone / açık kopya |
| Token / secret log | Asla |

## 7. Test zorunluluğu

- Her davranış değişikliğine Vitest (`src/**/*.test.ts`, `pnpm test`).
- Etkileşen sistemlerde **kombinasyon** düşün (ör. hunt × XP × stamina; market × coin × lock).
- “Editor testi” = ops panel / site / Discord akışı — **kod testinin yerine geçmez**; ayrı belirt.
- Üşenip test atlamak = sonraki bug avında token israfı.

## 8. Dokümantasyon puanı (JSDoc ≥ 8/10)

Yeni veya değişen **public** export (fonksiyon, type, class, sabit API):

1. JSDoc: ne işe yarar, invariant, yan etki (Redis/DB/Discord).
2. Ajan kendi içinde 10 üzerinden puanlar; **8 altıysa** uygulamadan önce iyileştir.
3. Satır-satır “i++ artırır” yorumu yasak.
4. Geriye dönük tüm koda JSDoc zorunlu değil — sadece yeni/değişen public API.

## 9. Memory bank

Implement / audit öncesi:

1. [`memory-bank/INDEX.md`](memory-bank/INDEX.md) — hangi modül dosyası
2. İlgili 1–2 modül notu (`architecture`, `modules`, `invariants`, …)
3. Sonra sadece ilgili `src/` dosyaları

55k satırı “anlamaya çalışmak” yerine haritayı kullan.

## 10. Frontier audit (ayrı oturum)

- Prompt: [`prompts/frontier-audit.md`](prompts/frontier-audit.md)
- Çıktı: `audits/YYYY-MM-DD.md`
- Uygulama: [`prompts/mid-apply.md`](prompts/mid-apply.md) — **en fazla 5 madde**, hepsini birden değil
- Kanıtsız / uydurma bug yazma; “kesin var” dili yok

## Hızlı checklist (her PR / ajan işi)

- [ ] INDEX + ilgili memory bank okundu
- [ ] Kapsam dışı dosya yok
- [ ] 800+ dosya büyütülmedi
- [ ] Sayılar config’te
- [ ] Hot path Prisma/lock ihlali yok
- [ ] Vitest eklendi/güncellendi
- [ ] Public API JSDoc ≥ 8/10
- [ ] Production kuralları ihlal edilmedi
