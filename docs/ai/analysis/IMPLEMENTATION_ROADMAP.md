# IMPLEMENTATION_ROADMAP — Uygulama Dalgaları

> [`FEATURE_MATRIX.md`](FEATURE_MATRIX.md) kararlarının 6 dalgaya dağılımı. Her dalga ayrı kullanıcı onayı bekler; peşpeşe uygulanmaz.
>
> Prensip: **düşük risk + yüksek getiri önce** (kullanıcı direktifi §31 P0 → P4 sırası).

---

## Dalga tablosu (özet)

| Dalga | Süre | Risk | Ana içerik | Kod dokunma | DDR gerekli |
|-------|------|:----:|------------|:-----------:|:-----------:|
| **1** | ~1 hafta | Düşük | P0 low-risk UI (görünürlük + dil) | Evet | Yok |
| **2** | ~1 hafta | Düşük-orta | P0 şeffaflık (drop tablosu + pity + welcome-back) | Evet | DDR-003 |
| **3** | ~1–2 hafta | Orta | P1 quick + metrikler | Evet | Yok |
| **4** | ~2 hafta | Orta | P1 medium (novelty + prey-dex + evrim vizyon) | Evet | Metrik sonrası C5 |
| **5** | ~1 hafta | Orta-yüksek | Design pivot: maintenance rework + gambling streak | Evet | DDR-001, DDR-002 |
| **6+** | ay+ | Yüksek | Büyük tasarım (guild, prestige, autonomy) | Evet | Her biri için DDR |

---

## Dalga 1 — P0 low-risk UI (Wave 1)

**Amaç:** Görünürlük + dil düzeltmesi. Hiçbir yeni sistem, hiçbir yeni sabit dışında minör copy.

| Kod | İş | Dosyalar | Efor | Test |
|-----|----|----------|:----:|------|
| A2 | Milestone yaklaşım göstergesi (son 3 av'da highlight) | [`utils/hunt-ux.ts`](../../../src/utils/hunt-ux.ts), [`systems/hunt-milestones.ts`](../../../src/systems/hunt-milestones.ts) | S | `src/__tests__/hunt-ux.test.ts` genişlet |
| A3 | Cooldown mesajı içerik (tek satır ipucu) — [DDR-006](../decisions/DECISION-006-cooldown-message-content.md) | [`utils/command-error.ts`](../../../src/utils/command-error.ts), yeni `utils/cooldown-hint.ts`, [`commands/owl-hunt.ts`](../../../src/commands/owl-hunt.ts) | M | Yeni `cooldown-hint.test.ts` |
| A5 | Daily quest kotası doğrulama (kod'da `DAILY_QUESTS_PER_DAY=4` zaten) + `w yardim` satır | [`commands/owl-help.ts`](../../../src/commands/owl-help.ts) | S | Mevcut `owl-help.test.ts` |
| A6 | Level tier etiketi | yeni `src/config/ui-tiers.ts`, [`commands/owl-stats.ts`](../../../src/commands/owl-stats.ts) veya [`utils/xp-ux.ts`](../../../src/utils/xp-ux.ts) | S | `ui-tiers.test.ts` yeni |
| I1 | Daily reward hediye dili — [DDR-004](../decisions/DECISION-004-daily-load-and-quest-fatigue.md) kısmi | [`commands/owl-daily.ts`](../../../src/commands/owl-daily.ts), copy-catalog | S | Mevcut daily-login testleri |
| L4 | Error mesajı dili review | [`utils/command-error.ts`](../../../src/utils/command-error.ts) | S | `command-error.test.ts` genişlet |
| I3 | Silent streak politika satırı yardım'a ekle | [`commands/owl-help.ts`](../../../src/commands/owl-help.ts) | S | — |

**Toplam efor:** ~3–5 iş günü.
**Ekonomi etkisi:** Yok (tümü UI).
**Rollback:** Revert commit — kolay.
**Metrik:** Sürpriz yok; feedback survey sonraki dalgalarda.
**Onay:** Bu dalga başlamadan önce kullanıcı onayı.

---

## Dalga 2 — P0 şeffaflık + welcome-back (Wave 2)

**Amaç:** Kullanıcı şikayeti kök nedenlerine cevap (pity + drop tablosu + welcome-back).

| Kod | İş | Dosyalar | Efor | Test |
|-----|----|----------|:----:|------|
| A4+D2 | Drop şeffaflığı (`/owl help drops`) + hunt sonucu pity satırı — [DDR-003](../decisions/DECISION-003-pity-and-softcap-transparency.md) | [`systems/hunt.ts`](../../../src/systems/hunt.ts), [`types/*`](../../../src/types/), [`utils/hunt-ux.ts`](../../../src/utils/hunt-ux.ts), [`commands/owl-help.ts`](../../../src/commands/owl-help.ts) | M | Yeni `hunt-pity-hint.test.ts`, mevcut `hunt-ux.test.ts` genişletme |
| A7 | Welcome-back pack (7+ gün, ay içinde 1) | [`systems/daily-login.ts`](../../../src/systems/daily-login.ts), yeni `systems/welcome-back.ts` (küçük), Redis key `welcomeback:{userId}` | M | Yeni `welcome-back.test.ts` |
| O2 | Balance changelog süreci (yazılı) | [`docs/CHANGELOG-v2.1-hardening.md`](../../CHANGELOG-v2.1-hardening.md) örneği + yeni `docs/CHANGELOG.md` konvansiyon dosyası | S | — (yazılı süreç) |

**Toplam efor:** ~5–7 iş günü.
**Ekonomi etkisi:** A7 pozitif ama küçük (ay içinde 1, gap 7+); kalibrasyon [`ECONOMY_IMPACT.md §5.1`](ECONOMY_IMPACT.md).
**Rollback:** Kolay; A7 için Redis key silmek yeterli.
**Metrik:** "Adalet" feedback + welcome-back tetiklenen oyuncu retention D1/D7.
**Onay:** Ayrı.

---

## Dalga 3 — P1 quick + metrikler (Wave 3)

**Amaç:** Autonomy proximal (bugünkü hedef) + market autonomy + gamble adalet + metrik altyapı.

| Kod | İş | Dosyalar | Efor | Test |
|-----|----|----------|:----:|------|
| E4 | Bugünkü hedef tek satır — [DDR-004](../decisions/DECISION-004-daily-load-and-quest-fatigue.md) kısmi | [`commands/owl-owl.ts`](../../../src/commands/owl-owl.ts), [`utils/hunt-ux.ts`](../../../src/utils/hunt-ux.ts), yeni `src/utils/today-focus.ts` | M | Yeni `today-focus.test.ts` |
| F2 | Market fiyat sinyali (soft) | [`utils/market-queries.ts`](../../../src/utils/market-queries.ts), [`utils/market-screens.ts`](../../../src/utils/market-screens.ts) | M | `market-queries.test.ts` genişlet |
| M1 | Görünür gamble istatistik — [DDR-002](../decisions/DECISION-002-gambling-streak-modifier.md) destekçisi | Yeni `src/commands/owl-kumar.ts` veya bj/cf handler'a alt komut | M | Yeni |
| P1 | Retention analytics D1/D7/D30 raporlama | [`systems/retention/metrics-baseline.ts`](../../../src/systems/retention/metrics-baseline.ts) genişlet, yeni admin komut `w admin retention` | M | Yeni `retention-metrics.test.ts` |
| P3 | Daily quest completion rate metriği | [`systems/quest-tracker.ts`](../../../src/systems/quest-tracker.ts) event log genişlet | S | — |
| P4 | Milestone claim istatistiği | [`systems/hunt-milestones.ts`](../../../src/systems/hunt-milestones.ts) audit event ekle | S | — |

**Toplam efor:** ~1–2 hafta.
**Ekonomi etkisi:** F2 dolaylı pozitif (bilgili alıcı); diğerleri UI/metrik.
**Metrik:** Bu dalga sonrası P3/P4 verisi Wave 4 C5 kalibrasyonuna girer.
**Onay:** Ayrı.

---

## Dalga 4 — P1 medium (Wave 4)

**Amaç:** Novelty + curiosity + session flow bonusu + tame görünürlük.

| Kod | İş | Dosyalar | Efor | Test |
|-----|----|----------|:----:|------|
| B3 | Session hunt streak (mikro-buff, session-bounded, cezasız) | [`systems/hunt.ts`](../../../src/systems/hunt.ts), Redis key `hunt:session:{userId}` TTL 15 dk | M | Yeni `hunt-session-streak.test.ts` |
| B5+K1 (MERGE) | Prey-dex progress bar + mystery `????` entries | [`utils/zoo-ux.ts`](../../../src/utils/zoo-ux.ts), [`utils/catalog-ux.ts`](../../../src/utils/catalog-ux.ts), [`systems/prey-dex.ts`](../../../src/systems/prey-dex.ts) | M | Mevcut `zoo-ux.test.ts` genişlet |
| C2 | Evrim (evolution) sürecini görselleştir | [`systems/owl-moon-evolution.ts`](../../../src/systems/owl-moon-evolution.ts), [`config/owl-evolution-emoji-ids.ts`](../../../src/config/owl-evolution-emoji-ids.ts), [`utils/evrim-ux.ts`](../../../src/utils/evrim-ux.ts) | M | `evrim-ux.test.ts` genişlet |
| C5 | Milestone XP eğrisi kalibrasyonu (Wave 3 P4 verisi sonrası) | [`config/hunt-milestones.ts`](../../../src/config/hunt-milestones.ts) — sabit ayar | S | `hunt-milestones.test.ts` |
| H4 | Newbie ceza-yok politika doğrulama + yazım | [`systems/retention/retention-modifiers.ts`](../../../src/systems/retention/retention-modifiers.ts) — mevcut kalıp; `w yardim` satırı ekle | S | — |
| DDR-005 kısmi | Tame personality → önerilen aksiyon ipucu satırı | [`utils/tame-ux.ts`](../../../src/utils/tame-ux.ts), [`utils/tame-narrative.ts`](../../../src/utils/tame-narrative.ts) | S | Yeni `tame-hint.test.ts` |

**Toplam efor:** ~2 hafta.
**Ekonomi etkisi:** B3 küçük XP bonusu — kalibre edilebilir; diğerleri UI.
**Metrik:** Tame başarı oranı, session-streak kullanım oranı, prey-dex mystery unlock oranı.
**Onay:** Ayrı.

---

## Dalga 5 — Design pivot (Wave 5)

**Amaç:** Audit'in P1/P2'sini uygula.

| DDR | İş | Dosyalar | Efor | Test |
|-----|----|----------|:----:|------|
| [DDR-001](../decisions/DECISION-001-daily-maintenance-rework.md) | Daily maintenance ceza → bonus | [`systems/economy.ts`](../../../src/systems/economy.ts), [`systems/items.ts`](../../../src/systems/items.ts), [`config.ts`](../../../src/config.ts) (yeni buff sabitleri) | M | Yeni `economy-maintenance.test.ts` |
| [DDR-002](../decisions/DECISION-002-gambling-streak-modifier.md) | Gambling streak modifier kaldır + retention nudge çek + RTP görünür | [`systems/gambling.ts`](../../../src/systems/gambling.ts), [`systems/gamble/settle.ts`](../../../src/systems/gamble/settle.ts), [`systems/retention/retention-modifiers.ts`](../../../src/systems/retention/retention-modifiers.ts), [`utils/math.ts`](../../../src/utils/math.ts) | M | `gamble-settle.test.ts` genişlet, RTP property test |

**Toplam efor:** ~1 hafta.
**Ekonomi etkisi:** DDR-001 nötr (aynı item sink); DDR-002 hafif pozitif (house edge normalize).
**Rollback:** Config sabitleri geri, revert commit.
**Metrik:** Feedback survey adalet + kumar-only oyuncu retention.
**Onay:** **Ayrı DDR onayı zorunlu** — bu dalga başlamaz kullanıcı DDR onaylamadan.

---

## Dalga 6+ — Büyük tasarım (aylara yayılır)

Bu maddelerin **her biri ayrı DDR gerektirir**. Roadmap sadece işaretliyor.

| Kod | İş | Ön koşul |
|-----|----|----------|
| B1 | Hunt micro-events (özel encounter) | Metrik + tasarım tartışması |
| B4 | Tame prey-family derinliği ([DDR-005](../decisions/DECISION-005-tame-decision-visibility.md) uzun kolu) | Playtest, kalibrasyon |
| C1 | Level-up functional unlock | Autonomy tartışması (C4) ile birlikte |
| C3 | Prestige / endgame meta-progression | Ayrı DDR (kapsam büyük) |
| C4 | Skill tree / build kararı | Autonomy tasarım turu |
| D3 | Kozmetik / non-power reward katmanı | Ekonomi + cosmetic asset üretimi |
| E1 | Haftalık / sezonluk quest | Weekly reset ritüeli (I2) ile |
| E3 | Quest kendi seç | Ekonomik denge + anti-farm |
| F1 | Trade log geçmiş | Prisma alan ekleme (schema) |
| G1 | Guild kolektif hedefi | Guild sistemi genişletme |
| G3 | Kudos sistemi | Moderation + spam koruma |
| G5+H3 | Novice/mentor + buddy-boost | RE-1 sosyal altyapı |
| H1 | İlk 30 dk happy path | UX refactor |
| I2 | Weekly reset ritüeli | E1 ile bağlı |
| I4 | Daily softening | Metrik gerekli |
| J1 | Aylık tema event | LiveOps cadence içerik |
| K3 | Gizli komut / mekanik | Spoiler kültürü değerlendirme |
| L3 | Görsel başarı anları (nadir) | Emoji + embed asset |
| M2 | Session bad-luck relief | DDR-002 sonrası tekrar bak (şu an REJECT) |
| N2 | Küçük mekanik varyasyonlar | LiveOps genişletme |

---

## Onay ve süreç

- Her dalga **bağımsız** planlanır ve onaylanır.
- Wave X başlamadan önce Wave X-1 metrikleri değerlendirilir.
- Her dalgada yeni feature'lar için FEATURE_PLAN doldurulur ([`FEATURE_PLAN_TEMPLATE.md`](../templates/FEATURE_PLAN_TEMPLATE.md)).
- Kod PR'ları [`feature-development.mdc`](../../../.cursor/rules/feature-development.mdc) acceptance kriterlerini karşılar.
- Rollback stratejisi her dalgada dokümante.

## Sonraki tur için ilk açılacak dosyalar (Wave 1)

Kullanıcı Wave 1'i onaylarsa:

1. [`src/utils/hunt-ux.ts`](../../../src/utils/hunt-ux.ts) → A2 milestone yaklaşım göstergesi (`compressed.huntMilestoneProgress` zaten var).
2. [`src/utils/command-error.ts`](../../../src/utils/command-error.ts) → A3 cooldown mesaj + L4 error dili merkezi.
3. Yeni `src/utils/cooldown-hint.ts` (henüz yok — Wave 1'de oluşturulacak) → 5 öncelikli ipucu hesabı.
4. Yeni `src/config/ui-tiers.ts` (henüz yok — Wave 1'de oluşturulacak) → A6 tier etiketi haritası.
5. [`src/commands/owl-help.ts`](../../../src/commands/owl-help.ts) → I3 silent streak politika + A5 quest kotası satırı.
6. [`src/commands/owl-daily.ts`](../../../src/commands/owl-daily.ts) → I1 hediye dili.

**Kontrol:** Bu dosyaların hiçbiri 800 satır sınırını yeni eklenecek satırla aşmıyor (`command-error.ts` en yüksek, ~250 satır tahmin edilir; +50 ekleme rahat).

**Belge sonu.**
