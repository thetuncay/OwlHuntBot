# FEATURE_PLAN — `<feature_code veya kısa isim>`

> Doldurulmuş kopya: `docs/ai/plans/FEATURE_PLAN-<feature_code>.md`
>
> Zorunlu — hiçbir bölüm boş bırakılmaz.

---

## 1. Problem

Bir cümle. Hangi ihtiyaç? Kim / ne / neden?

## 2. Goal

Ölçülebilir kabul kriteri. "Şey iyi olsun" değil, "X metriği Y olur / oyuncu Z komutunu W ekranda görür".

## 3. User Experience (UX)

Oyuncunun Discord'da göreceği net akış. **Örnek mesaj / embed** ver (mock):

```
w hunt
🌙 Efe, avdan döndü.
┃ 🦉×2 🐁×1
┃ 💎 XP: 34   🪙 22 coin
┃ Av serisi 6/25   ← <A2 highlight burada varsa göster>
```

Autonomy / dayatma dengesi: mesaj "önerin: ..." dilinde, "yapmalısın" değil.

## 4. Existing Systems

Bu özellik hangi mevcut sistemi kullanacak / değiştirecek?

- Kod dosyaları: `src/systems/...`, `src/commands/...`, `src/utils/...`
- Kaynaklar: memory-bank, [`FEATURE_MATRIX.md`](../analysis/FEATURE_MATRIX.md) satırı, ilgili DDR

## 5. Affected Modules

| Dosya | Değişiklik türü | +/- satır tahmini | 800+ sınır kontrolü |
|-------|-----------------|-------------------|---------------------|
| `src/...` | edit / add | +X | mevcut Y, sonuç Z |
| | | | |

## 6. Database Impact

- Schema değişikliği: yok / var (aşağıda migration şeması)
- Yeni tablo / kolon: `<yok>` veya SQL örneği
- Migration stratejisi: onay bekliyor (prisma migrate deploy yasak)

## 7. Economy Impact

[`economy-safety.mdc`](../../../.cursor/rules/economy-safety.mdc) checklist:

- [ ] Hangi kanal? source / sink / nötr
- [ ] Günlük cap: `<yok>` / `<sayı>`
- [ ] Farming yüzeyi: L/M/H — gerekçe
- [ ] `applyRewardMultiplier` API'sinden geçiyor mu?
- [ ] Sabitler `config.ts`'te mi?

Skill: [`economy-balance`](../../../.cursor/skills-owlhunt/economy-balance/SKILL.md) çıktısını iliştir.

## 8. Gameplay Impact

[`game-design.mdc`](../../../.cursor/rules/game-design.mdc) SDT üç soru:

- Competence: <evet/hayır, gerekçe>
- Autonomy: <evet/hayır, gerekçe>
- Relatedness: <evet/hayır, gerekçe>

**En az 2/3 evet** yoksa DEFER.

Core loop etkisi: **+ / 0 / −** (+ olmalı).

## 9. Edge Cases

Aşağıdaki durumları düşün ve nasıl davrandığını yaz:

- Empty state (henüz hunt yapmamış oyuncu)
- Race condition (aynı anda 2 istek)
- Boş envanter / cap dolu
- Newbie oyuncu (ilk 7 gün)
- Churning oyuncu (retention modifier aktif)
- Offline / gateway kesintisi
- Redis miss (cache invalidate)

## 10. Tests

Vitest suite adı + kapsam:

- `src/__tests__/<feature>.test.ts` — <ne test ediyor?>
- Integration senaryosu (varsa): `src/__tests__/integration-<feature>.test.ts`
- Property test (uygunsa fast-check): <invariant>

Test coverage kalemleri:

- [ ] Happy path
- [ ] Cap boundary
- [ ] Race (lock altında)
- [ ] Edge state (yeni oyuncu, boş inventory)

## 11. Rollback

- Kod: revert commit → PM2 restart bekler (kullanıcı onayı)
- Config: sadece config değişikliğiyse rollback = eski config commit
- Data: `<var/yok>` — varsa nasıl geri alınır (idempotent mi?)
- Feature flag: `<yok/var>` — Redis key ile toggle mümkün mü?

## 12. Metrics

Feature yayınlandıktan sonra ölçülecek:

- Ana metrik: `<sayı / oran>`
- Yan etki metriği: `<retention, feedback survey, support ticket>`
- Ölçüm süresi: `<2 hafta / 30 gün>`
- Ayarlama tetikleyicisi: `<metrik X eşiği>`

---

## Kabul kriterleri

Feature merge'lenmeden önce:

- [ ] Bu doküman doldurulmuş ve DDR'ye referans veriyor (gerekiyorsa)
- [ ] Vitest yeşil (`pnpm test`)
- [ ] Lint temiz (`pnpm lint`)
- [ ] Build başarılı (`pnpm build`)
- [ ] Public API JSDoc ≥ 8/10
- [ ] `docs/ai/memory-bank/active-context.md` güncellendi
- [ ] Self-critique zinciri geçti ([`feature-development.mdc`](../../../.cursor/rules/feature-development.mdc))
- [ ] Reviewer onayı (kullanıcı)

---

## Bağı

- [`../.cursor/rules/feature-development.mdc`](../../../.cursor/rules/feature-development.mdc)
- [`../analysis/FEATURE_MATRIX.md`](../analysis/FEATURE_MATRIX.md)
- [`../analysis/ECONOMY_IMPACT.md`](../analysis/ECONOMY_IMPACT.md)
- [`../decisions/`](../decisions/) — ilgili DDR
