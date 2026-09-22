# MISSING_FEATURES — Belgede Var, Kodda Yok

> Research belgelerinde (`docs/research/*.md`) önerilen veya varsayılan ama koda **hiç yansımamış** özellikler. Bunlar action-list'in `IMPLEMENT` kararı olanlar arasından `MISSING` (kod yok) olarak sınıflananlar.
>
> Kaynak: [`FEATURE_MATRIX.md`](FEATURE_MATRIX.md) tabloları + grep doğrulaması.

---

## 1. Welcome-back pack (A7)

- **Belge:** action-list A7 · RT-3/RT-4 · E2.
- **Kod:** Yok. Grep `welcomeback|welcome-back|welcomeBack` boş.
- **Hook noktası:** [`systems/daily-login.ts`](../../../src/systems/daily-login.ts) — `computeNextStreak` sonrası "gap ≥ 7 gün mü" branch'i.
- **Wave:** 2.

## 2. Şeffaf pity mekanizması gösterimi (D2)

- **Belge:** action-list D2 · RW-3/TR-1 · E1.
- **Kod:** Backend var (`noRareStreak`, `HUNT_PITY_THRESHOLD=8`), UX'te **hiçbir yerde gösterilmiyor**. Grep `pity` sadece kodda internal.
- **Hook noktası:** [`utils/hunt-ux.ts:buildFinalMessage`](../../../src/utils/hunt-ux.ts) — ek satır.
- **Wave:** 2. DDR: [`DECISION-003`](../decisions/DECISION-003-pity-and-softcap-transparency.md).

## 3. Drop oranı şeffaflığı (A4)

- **Belge:** action-list A4 · TR-1/TR-3 · E1.
- **Kod:** Yok. `/owl help` içinde drops topic yok — sadece `av/esya/pvp/ekonomi/market/kumar/ipucu/build`.
- **Hook noktası:** [`commands/owl-help.ts:HELP_TOPIC_LABELS`](../../../src/commands/owl-help.ts) + yeni topic.
- **Wave:** 2.

## 4. Level tier etiketi (A6)

- **Belge:** action-list A6 · CO-4 · E1.
- **Kod:** Yok. `owl-stats.ts` sadece sayı gösteriyor.
- **Hook noktası:** yeni `src/config/ui-tiers.ts` (Wave 1'de oluşturulacak) — tier eşik + etiket haritası.
- **Wave:** 1.

## 5. Session hunt streak (B3)

- **Belge:** action-list B3 · MA-2/FL-1 · E1.
- **Kod:** `huntComboStreak` var ama **süre bazlı** değil, catch-based. Session penceresi (örn. son N dakikada M hunt) yok.
- **Hook noktası:** [`systems/hunt.ts`](../../../src/systems/hunt.ts) — Redis session key `hunt:session:{userId}` + TTL 15 dk.
- **Wave:** 4.

## 6. Milestone yaklaşım göstergesi (A2)

- **Belge:** action-list A2 · GO-1/CU-1 · E1.
- **Kod:** `huntMilestoneProgress` (`7/25`) zaten mesajda; **son 3'te vurgu yok**.
- **Hook noktası:** [`utils/hunt-ux.ts`](../../../src/utils/hunt-ux.ts) `formatFinalMessage`.
- **Wave:** 1.

## 7. Cooldown mesajı içeriği (A3)

- **Belge:** action-list A3 · FL-4/CO-1 · E1.
- **Kod:** [`utils/command-error.ts:buildCooldownMessage`](../../../src/utils/command-error.ts) sadece süre. Bilgilendirici içerik yok.
- **Hook noktası:** aynı yerde + `resolveFlowRejectMessage`.
- **Wave:** 1. DDR: [`DECISION-006`](../decisions/DECISION-006-cooldown-message-content.md).

## 8. Prey-dex mystery entries + progress bar (B5 + K1)

- **Belge:** action-list B5 (progress) + K1 (mystery `????`).
- **Kod:** [`systems/prey-dex.ts`](../../../src/systems/prey-dex.ts) — `discovered` var, `????` mystery + hint yok.
- **Hook noktası:** [`utils/zoo-ux.ts`](../../../src/utils/zoo-ux.ts) veya `catalog-ux.ts` — undiscovered için `????` + partial hint.
- **Wave:** 4.

## 9. Bugünkü hedef tek satır (E4)

- **Belge:** action-list E4 · GO-1 · E1.
- **Kod:** Yok. `w owl` panelinde günün önerisi satırı yok.
- **Hook noktası:** [`commands/owl-owl.ts`](../../../src/commands/owl-owl.ts).
- **Wave:** 3.

## 10. Market fiyat sinyali (F2)

- **Belge:** action-list F2 · CO-4/TR-1 · E1.
- **Kod:** MarketListing kayıtları var, geçmiş fiyat aggregatı **hesaplanmıyor / gösterilmiyor**.
- **Hook noktası:** [`utils/market-queries.ts`](../../../src/utils/market-queries.ts) — `avgSoldPrice`; UI: `market-screens`.
- **Wave:** 3.

## 11. Trade log görüntüsü (F1)

- **Belge:** action-list F1 · TR-2/RE-1 · E1.
- **Kod:** [`systems/trade.ts`](../../../src/systems/trade.ts) escrow var; TradeSession audit henüz yok ([memory-bank active-context](../memory-bank/active-context.md)).
- **Wave:** DEFER (Wave 3+). Prisma alanı gerekebilir.

## 12. Görünür gamble istatistik (M1)

- **Belge:** action-list M1 · TR-1/TR-3 · E1.
- **Kod:** `gambleStreakWins/Losses` var; listeleme komutu yok.
- **Hook noktası:** yeni `w kumar stats` alt komutu; [`commands/coinflip.ts`](../../../src/commands/coinflip.ts) veya yeni handler.
- **Wave:** 3.

## 13. Weekly quests + reset ritüeli (E1 + I2)

- **Belge:** action-list E1/I2.
- **Kod:** Yok. `weekly-quests.ts` yok.
- **Wave:** DEFER (Wave 6+) — büyük tasarım.

## 14. Guild kolektif hedefi (G1)

- **Belge:** action-list G1 · RE-3 · E1.
- **Kod:** [`systems/guild-lifecycle.ts`](../../../src/systems/guild-lifecycle.ts) 198 satır; kolektif quest/hedef yok.
- **Wave:** DEFER (Wave 6+).

## 15. Kudos + Mentor + Buddy-boost (G3, G5, H3)

- **Belge:** action-list.
- **Kod:** Yok.
- **Wave:** DEFER (Wave 6+).

## 16. Aylık tema event (J1) + Gizli mekanik (K3)

- **Belge:** action-list J1/K3.
- **Kod:** LiveOps cadence altyapı var; içerik yok.
- **Wave:** DEFER.

## 17. Kozmetik / non-power reward katmanı (D3)

- **Belge:** action-list D3 · RW-4+ · E1.
- **Kod:** [`config/custom-emojis.ts`](../../../src/config/custom-emojis.ts) altyapı; unvanlar / renk varyantları / cosmetic system **yok**.
- **Wave:** DEFER (Wave 6+).

## 18. Retention analytics tabanlı D1/D7/D30 raporlaması (P1)

- **Belge:** action-list P1 · metrik · E1.
- **Kod:** [`retention/metrics-baseline.ts`](../../../src/systems/retention/metrics-baseline.ts) iskelet var; agregasyon + raporlama eksik.
- **Wave:** 3.

## 19. Quest completion rate metrikleri (P3)

- **Belge:** action-list P3.
- **Kod:** [`quest-tracker.ts`](../../../src/systems/quest-tracker.ts) event var, agregat komut yok.
- **Wave:** 3.

## 20. Milestone claim istatistiği (P4)

- **Belge:** action-list P4.
- **Kod:** [`hunt-milestones.ts`](../../../src/systems/hunt-milestones.ts) tick sonrası audit eksik.
- **Wave:** 3.

## 21. `/owl help drops` şeffaflık dokümanı (O1)

- **Belge:** action-list O1 · TR-1 · E1.
- **Kod:** Yok.
- **Wave:** 2 (A4 ile birlikte).

## 22. Balance changelog süreci (O2)

- **Belge:** action-list O2.
- **Kod:** [`docs/CHANGELOG-v2.1-hardening.md`](../../CHANGELOG-v2.1-hardening.md) tek örnek var, düzenli süreç yok.
- **Wave:** 2 (yazılı süreç, kod değil).

---

## Özet — Wave sıralamasına göre eksikler

| Wave | Adet | Örnek maddeler |
|------|:----:|----------------|
| 1 | 4 | A2, A3, A6, I1 |
| 2 | 4 | A4, A7, D2, O2 |
| 3 | 6 | E4, F2, M1, P1, P3, P4 |
| 4 | 3 | B3, B5+K1, C2 |
| 5 | 2 | DDR-001, DDR-002 uygulaması |
| 6+ | 10 | B1, B4, C3, C4, D3, E1, F1, G1, G3, G5, H1, H3, I2, J1, K3 |

**Belge sonu.** İlgili: [`UNDOCUMENTED_SYSTEMS.md`](UNDOCUMENTED_SYSTEMS.md), [`FEATURE_MATRIX.md`](FEATURE_MATRIX.md).
