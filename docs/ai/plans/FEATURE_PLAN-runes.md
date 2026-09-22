# FEATURE_PLAN — Rün sistemi

## 1. Problem

Tame/savaş sonrası kalıcı, nadir ilerleme ödülü yoktu.

## 2. Goal

Oyuncu nadiren rün düşürür; `w rün` ile listeler; `w rün 040` main’e kesin uygular.

## 3. User Experience (UX)

```
🪶 **Büyülü Tüy** düştü!

w rün
🔮 RÜN · Main +2
040 🪶 Büyülü Tüy ×1
…
w rün 040
✅ Büyülü Tüy · main’e uygulandı
```

## 4. Existing Systems

- `tame.ts` commitTameResult, `encounter-fight.ts` resolveEncounterFight
- `owl-stats` trained, `player-state` inventory Redis

## 5. Affected Modules

| Dosya | Değişiklik |
|-------|------------|
| `config/runes.ts` | add |
| `systems/runes.ts` | add |
| `utils/rune-ux.ts` | add |
| `commands/owl-runes.ts` | add |
| tame / encounter-fight / owl / katalog / help / emojis | edit |

## 6. Database Impact

Schema değişikliği yok.

## 7. Economy Impact

- Source: kalıcı trained
- Farming: L (düşük gate)
- Cap: yok (gate yeter)
- Sabitler: `config/runes.ts`

## 8. Gameplay Impact

- Competence: evet (kalıcı güç)
- Autonomy: evet (ne zaman uygula)
- Relatedness: hayır
- Core loop: +

## 9. Edge Cases

- Main yok → apply hata
- Stok 0 → hata
- Çift tık → withLock

## 10. Tests

`src/__tests__/runes.test.ts`

## 11. Rollback

Feature flag yok; drop gate 0 yapılabilir / komut kaldırılır.

## 12. Metrics

Drop satırı sayısı (log); apply Redis sayaç.
