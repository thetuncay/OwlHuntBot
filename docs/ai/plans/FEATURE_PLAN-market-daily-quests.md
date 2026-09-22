# FEATURE_PLAN — Market günlük görev teşviki

## 1. Problem

İnce market piyasasında oyuncular ilan koymuyor; günlük görevler markete yeterince yönlendirmiyor.

## 2. Goal

- Her günlük sette **en az 2** market görevi.
- Görevler ilan koyma / markete bakma odaklı, düşük hedef (1–3).
- `market_buy` / `market_owl` günlük seçime girmez (karşı taraf / yedek baykuş gerekir).

## 3. UX

`w quest` örneği:

```
┃ 🏪 2/3 market ilanı koy
┃ 📦 1/1 eşya veya av ilanı koy
┃ 🛒 Markete bak
┃ 🌙 3 hayvan avla
```

## 4. Existing Systems

`daily-quest-pool.ts`, `daily-quests.ts` pick, `market.ts` list hooks, `owl-market.ts` hub/myshop.

## 5. Affected Modules

| Dosya | Değişiklik |
|-------|------------|
| `src/config/daily-quest-pool.ts` | yeni tipler + etiket + sabitler |
| `src/systems/daily-quests.ts` | garantili 2 market pick |
| `src/systems/market.ts` | `market_item` track |
| `src/commands/owl-market.ts` | browse / myshop track |
| `src/__tests__/daily-quests.test.ts` | pick garantisi |

## 6. Database Impact

Yok (type string; migrate yok).

## 7. Economy Impact

- Kanal: mevcut quest coin/XP source (yeni ekonomi yok).
- Farming: L — günlük 4 görev cap.
- Sabitler pool dosyasında.

## 8. Gameplay Impact

- Competence: evet (kolay tamamlanır).
- Autonomy: evet (zorunlu alım yok).
- Relatedness: evet (ilan = pazar yüzeyi).
- Core loop: **+** (hunt → envanter → ilan).

## 9. Edge Cases

- Envantersiz: browse/myshop tamamlanır; ilan görevleri hunt sonrası.
- Level &lt; 5: market zaten kapalı (mevcut).

## 10. Tests

`daily-quests.test.ts` — her pick’te ≥2 market tipi.

## 11. Rollback

Pick + pool satırlarını geri al.

## 12. Metrics

Mevcut `recordQuestComplete` / market list sayıları.
