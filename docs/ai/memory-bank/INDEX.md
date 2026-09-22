# Memory Bank — INDEX

OwlHunt ajan haritası. **55k satır `src/` okuma yerine** buradan başla; yalnızca ilgili 1–2 dosyayı aç.

Kanun: [`../AI_GUIDELINES.md`](../AI_GUIDELINES.md)

## Görev → okuma sırası

| Görev türü | Önce oku | Sonra (gerekirse) | Tipik `src/` |
|------------|----------|-------------------|--------------|
| Genel mimari / “proje ne?” | `architecture.md` | `modules.md` | — |
| Yeni özellik / bug fix | `modules.md` + `invariants.md` | `active-context.md` | ilgili command/system |
| Hunt / XP / stamina | `invariants.md` | `architecture.md` | `systems/hunt.ts`, `state/player-state.ts` |
| Ekonomi / coin / market | `invariants.md` | `decisions.md` | `systems/market.ts`, `utils/lock.ts`, `db-queue.ts` |
| PvP / gamble | `modules.md` | `invariants.md` | `systems/pvp*.ts`, `systems/gamble/` |
| Anticheat / ban | `modules.md` | `invariants.md` | `anticheat/*`, `middleware/` |
| Ops panel / site / OAuth | `modules.md` | `architecture.md` | `ops/*`, `ops-panel.ts` |
| Config / formül / sayı | `invariants.md` | `decisions.md` | `config.ts`, `config/*` |
| Rün / kalıcı trained drop | `active-context.md` + `../decisions/DECISION-009-rune-system.md` | `config/runes.ts` | `systems/runes.ts`, `commands/owl-runes.ts` |
| Deploy / PM2 / DB | `.cursor/rules/*` | `architecture.md` | scripts — **yazma yok** onay olmadan |
| Frontier audit | `../prompts/frontier-audit.md` | `invariants.md` | hedeflenen klasör |

## Dosya listesi

| Dosya | Ne |
|-------|-----|
| [`architecture.md`](architecture.md) | Stack, süreçler, Redis-first, global ekonomi |
| [`modules.md`](modules.md) | Klasör haritası + kilit dosyalar |
| [`invariants.md`](invariants.md) | Bozulmaması gereken kurallar |
| [`decisions.md`](decisions.md) | Kısa ADR’ler |
| [`active-context.md`](active-context.md) | Şu anki odak (iş bitince güncelle) |

## Derin analiz (2026-09-14 engagement wave)

| Klasör | Ne | Ne zaman aç |
|--------|-----|-------------|
| [`../analysis/`](../analysis/) | Mimari + core loop + feature matrix + ekonomi + roadmap | Yeni feature değerlendirmesi, mimari sorusu |
| [`../decisions/`](../decisions/) | DDR-001..007 detay | Bir DDR'ye referans verildiğinde |
| [`../templates/FEATURE_PLAN_TEMPLATE.md`](../templates/FEATURE_PLAN_TEMPLATE.md) | Feature plan şablonu | Implementasyon öncesi doldurulacak |

## Kullanım kuralı

1. Bu INDEX’i oku → satır seç.
2. Sadece o satırdaki memory bank dosyalarını aç.
3. Sonra grep/read ile dar `src/` hedefi.
4. Hunt işinde `ops` notunu; ops işinde `hunt` detayını yükleme.
5. Yeni bir engagement özelliği geliyorsa önce [`../analysis/FEATURE_MATRIX.md`](../analysis/FEATURE_MATRIX.md) ve ilgili DDR.
