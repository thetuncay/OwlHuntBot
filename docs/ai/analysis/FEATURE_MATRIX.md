# FEATURE_MATRIX — Engagement Action List Karar Tablosu

> Kaynak: [`docs/research/owlhunt-engagement-action-list.md`](../../research/owlhunt-engagement-action-list.md) (rapor + prensip kodları) + kod gerçekliği.
>
> Amaç: her madde için tek karar (**IMPLEMENT / IMPLEMENT WITH CHANGES / MERGE / DEFER / REJECT**), gerekçesi kod referansına veya audit bulgusuna bağlı.
>
> Kural: **Aynı amaca hizmet edenler MERGE.** Feature creep yok.

---

## 0. Lejand

| Kolon | Açıklama |
|-------|----------|
| **Kod** | Action-list madde kodu (A1, B4 …) |
| **Design Value** | Oyuncu deneyimine katkı: L=Low, M=Medium, H=High |
| **Code Compat.** | Mevcut mimariye uyum: E=Easy, M=Medium, H=Hard |
| **Core Loop Impact** | +=güçlendirir, 0=nötr, −=zayıflatır (audit §1-6 çıkarımı) |
| **Complexity** | S=hours, M=1–3 gün, L=1+ hafta |
| **LT Value** | Uzun vadeli değer (H/M/L) |
| **Karar** | IMPLEMENT / IMPLEMENT WITH CHANGES (IWC) / MERGE / DEFER / REJECT |
| **Kanıt** | Rapor bölümü + kod referansı |

**Karar tanımları:**
- **IMPLEMENT**: Kod olarak eklenecek, mevcut mimariye uyar, risk düşük.
- **IWC** (Implement with changes): Fikir doğru ama uygulama detayı revize edilmiş — Wave planında not.
- **MERGE**: Başka bir madde ile birleşik implementasyon.
- **DEFER**: Mevcut turda değil, metrik veya başka karar bekliyor.
- **REJECT**: Uygulanmayacak — sebep var (dark pattern sınırı, core loop zararı, yerine geçen sistem).

---

## 1. Quick-wins (P0)

| Kod | Başlık | DV | CC | Loop | Cx | LT | Karar | Kanıt |
|-----|--------|:--:|:--:|:----:|:--:|:--:|:------|-------|
| A1 | Session-ending fanfare | M | E | + | S | M | **DEFER** — audit'te yok, kod'da session sonu belirsiz (auto-delete ile karışır). Metrik olmadan gürültü. | Aksiyon-list §18 tablosu; audit uyarı |
| A2 | Milestone yaklaşım göstergesi (son 3) | H | E | + | S | M | **IMPLEMENT** (Wave 1) | Audit §1 MINIMAL CHANGE 1 (§S1); kod: [`hunt-ux.ts:126`](../../../src/utils/hunt-ux.ts) `huntMilestoneProgress` zaten var |
| A3 | Cooldown mesajı "anlamlı" | M | E | + | S | M | **IMPLEMENT** (Wave 1) — DDR-006 içerik kararı | [`commands/owl-hunt.ts:enforceHuntCooldown`](../../../src/commands/owl-hunt.ts); [`utils/command-error.ts:buildCooldownMessage`](../../../src/utils/command-error.ts) |
| A4 | Drop oranı şeffaflığı | H | E | + | M | H | **IMPLEMENT** (Wave 2) — DDR-003 kapsamı | Audit §3, §S1; kod: [`systems/drops.ts`](../../../src/systems/drops.ts) sabitleri |
| A5 | Daily quest kotası (3–5) | M | E | 0 | S | M | **IMPLEMENT WITH CHANGES → sadece doğrulama** (Wave 1) | Kod zaten `DAILY_QUESTS_PER_DAY=4` [`daily-quest-pool.ts`](../../../src/config/daily-quest-pool.ts); ekstra iş yok, sadece help satırı |
| A6 | Level tier etiketi (5–8 tier) | M | E | + | S | M | **IMPLEMENT** (Wave 1) | Audit §S1 CO-4; kod: [`commands/owl-stats.ts`](../../../src/commands/owl-stats.ts) — konfig `src/config/ui-tiers.ts` (yeni) |
| A7 | Welcome-back pack | M | M | + | M | M | **IMPLEMENT** (Wave 2) | Kod: **yok** (grep boş); [`systems/daily-login.ts`](../../../src/systems/daily-login.ts) hook noktası |
| I1 | Daily reward hediye dili | M | E | + | S | M | **IMPLEMENT** (Wave 1) — DDR-004 birleşimi | Audit §6 MINIMAL CHANGE 2; kod: `daily-login` çıktı formatı |
| L4 | Error mesajı dili review | M | E | + | S | M | **IMPLEMENT** (Wave 1) | Kod: [`utils/command-error.ts`](../../../src/utils/command-error.ts) — merkezî |
| O2 | Balance changelog süreci | M | E | 0 | S | M | **IMPLEMENT** (Wave 2) — sadece yazılı süreç, kod dokunmaz | Audit §S1 TR-3 |

## 2. Hunt loop (P1)

| Kod | Başlık | DV | CC | Loop | Cx | LT | Karar | Kanıt |
|-----|--------|:--:|:--:|:----:|:--:|:--:|:------|-------|
| B1 | Micro-events (özel encounter) | M | H | + | L | H | **DEFER** — mevcut encounter sistemi zaten var; sadece frekans/varyant kalibrasyonu ile yetinilecek; büyük yeni içerik gerektirir | Kod: [`systems/tame.ts:createEncounter`](../../../src/systems/tame.ts) mevcut |
| B3 | Session hunt streak (mikro-buff) | M | M | + | M | M | **IMPLEMENT** (Wave 4) | Kod'da `huntComboStreak` var; session-bounded time bonus yok |
| B4 | Tame prey-family derinliği | H | M | + | M | H | **IMPLEMENT WITH CHANGES** (Wave 6) → DDR-005 | Kod: [`tame-session.ts`](../../../src/systems/tame-session.ts) 3-aksiyon zaten; **prey-family counter tablosu** yeni |
| B5 | Prey-dex progress bar + hint | M | E | + | M | H | **IMPLEMENT** (Wave 4) — K1 ile MERGE | [`commands/owl-katalog.ts`](../../../src/commands/owl-katalog.ts); [`systems/prey-dex.ts`](../../../src/systems/prey-dex.ts) |

## 3. Progression & mastery (P1–P2)

| Kod | Başlık | DV | CC | Loop | Cx | LT | Karar | Kanıt |
|-----|--------|:--:|:--:|:----:|:--:|:--:|:------|-------|
| C1 | Level-up functional unlock | H | M | + | M/L | H | **DEFER** — mevcut `min level` sistemi kısmen var (biome, feature); geniş refactor Wave 6 tartışması | Kod: [`systems/hunt.ts:244`](../../../src/systems/hunt.ts) min level check |
| C2 | Evrim (evolution) süreci görselleştir | M | M | + | M | M | **IMPLEMENT** (Wave 4) | Kod: [`systems/owl-moon-evolution.ts`](../../../src/systems/owl-moon-evolution.ts), [`config/owl-evolution-emoji-ids.ts`](../../../src/config/owl-evolution-emoji-ids.ts) |
| C3 | Prestige meta-progression | H | H | + | L | H | **DEFER — DDR ayrı tartışma gerekli** | [`commands/owl-prestige.ts:6-16`](../../../src/commands/owl-prestige.ts) kaldırılmış; endgame belirsiz |
| C4 | Skill tree / build kararı | H | H | + | L | H | **DEFER** (Wave 6) — büyük tasarım | Rapor AN-1 |
| C5 | Milestone XP eğrisi kalibrasyonu | M | E | 0 | S | M | **IMPLEMENT AFTER METRICS** (Wave 4) — P4 metrik sonrası | [`config/hunt-milestones.ts`](../../../src/config/hunt-milestones.ts) tek dosya |

## 4. Rewards & variability (P1)

| Kod | Başlık | DV | CC | Loop | Cx | LT | Karar | Kanıt |
|-----|--------|:--:|:--:|:----:|:--:|:--:|:------|-------|
| D1 | Cömert base + nadir spike | M | E | + | M | M | **DEFER** — metrik olmadan kalibre etmek yanıltıcı; C5 ile birlikte | Audit §3 |
| D2 | Şeffaf pity mekanizması | H | E | + | M | H | **IMPLEMENT** (Wave 2) → DDR-003 ana ürün | Audit §S1, kullanıcı şikayeti direct link; kod: `noRareStreak` state |
| D3 | Kozmetik / non-power reward | H | H | + | L | H | **DEFER** (Wave 6+) — büyük yeni katman | Kod: `config/custom-emojis.ts` altyapı yeterli değil |
| D4 | Drop hikaye anlatısı | M | M | + | M | M | **MERGE → K2** (lore parçaları) | İçerik ağırlıklı; kod aynı hook |

## 5. Goals & quests (P1)

| Kod | Başlık | DV | CC | Loop | Cx | LT | Karar | Kanıt |
|-----|--------|:--:|:--:|:----:|:--:|:--:|:------|-------|
| E1 | Haftalık/sezonluk quest | H | M | + | L | H | **DEFER** (Wave 6) → design tartışma | Kod: yok; `weekly-quests.ts` referansı sadece rapor |
| E3 | Quest "kendi seç" (3'ten 2) | M | M | + | M | M | **DEFER** — sistem deterministik seçim; refactor gerekli, öncelik P1'de değil | [`systems/daily-quests.ts:pickDailyQuestTypes`](../../../src/systems/daily-quests.ts) |
| E4 | Bugünkü hedef tek satır | M | E | + | S | M | **IMPLEMENT** (Wave 3) | Kod: [`commands/owl-owl.ts`](../../../src/commands/owl-owl.ts) + [`utils/hunt-ux.ts`](../../../src/utils/hunt-ux.ts) |

## 6. Trade & market (P1)

| Kod | Başlık | DV | CC | Loop | Cx | LT | Karar | Kanıt |
|-----|--------|:--:|:--:|:----:|:--:|:--:|:------|-------|
| F1 | Trade log / geçmiş | M | M | + | M | M | **DEFER** (Wave 3) — TradeSession audit henüz yok ([memory-bank active](../memory-bank/active-context.md)) | [`systems/trade.ts`](../../../src/systems/trade.ts) |
| F2 | Market fiyat sinyali (soft) | H | M | + | M | H | **IMPLEMENT** (Wave 3) | [`systems/market.ts`](../../../src/systems/market.ts); [`utils/market-screens.ts`](../../../src/utils/market-screens.ts) |

## 7. Guild / social (P1–P2)

| Kod | Başlık | DV | CC | Loop | Cx | LT | Karar | Kanıt |
|-----|--------|:--:|:--:|:----:|:--:|:--:|:------|-------|
| G1 | Guild kolektif hedefi | H | H | + | L | H | **DEFER** (Wave 6) — [`guild-lifecycle.ts`](../../../src/systems/guild-lifecycle.ts) 198 satır; kolektif hedef altyapısı yok | Audit §S3 |
| G3 | Kudos sistemi | M | M | + | M | M | **DEFER** (Wave 6) — social spam riski, moderation gerekli | Rapor RE-2 |
| G5 | Novice/mentor bağı | H | H | + | L | H | **DEFER** — büyük altyapı; H3 (buddy-boost) ile sonra birleşebilir | Rapor RE-1/RE-4 |

## 8. Onboarding & newbie retention (P1)

| Kod | Başlık | DV | CC | Loop | Cx | LT | Karar | Kanıt |
|-----|--------|:--:|:--:|:----:|:--:|:--:|:------|-------|
| H1 | İlk 30 dk happy path | H | M | + | M | H | **DEFER** — ayrı UX projesi; mevcut newbie hint + ilk hunt bilgi zaten var | [`systems/onboarding.ts`](../../../src/systems/onboarding.ts), [`utils/newbie-hints.ts`](../../../src/utils/newbie-hints.ts) |
| H3 | Yeni oyuncu buddy-boost (NPC dialog) | M | M | + | M | M | **DEFER** — dialog içeriği ağır; G5 mentor ile birleşebilir | Rapor RE-1 |
| H4 | İlk 7 gün cezasız | M | E | + | S | M | **IMPLEMENT WITH CHANGES → newbie retention modifier zaten 0** | [`retention-modifiers.ts:63-66`](../../../src/systems/retention/retention-modifiers.ts) doğrulanacak; audit satırı yaz |

## 9. Daily / streak / return (P0–P1)

| Kod | Başlık | DV | CC | Loop | Cx | LT | Karar | Kanıt |
|-----|--------|:--:|:--:|:----:|:--:|:--:|:------|-------|
| I1 | Daily reward hediye dili | M | E | + | S | M | **IMPLEMENT** (Wave 1) — Yukarıda P0 tablosu | — |
| I2 | Weekly reset "taze başlangıç" | M | M | + | S | L | **DEFER** — E1 (weekly quests) ile bağlı; E1 defer edilirse bu da defer | — |
| I3 | Silent streak politikasını yaz | M | E | + | S | M | **IMPLEMENT** (Wave 2) — [`commands/owl-help.ts`](../../../src/commands/owl-help.ts) hunt bölümüne 1 satır | Audit §S2 |
| I4 | Daily cap → softening | M | M | + | M | M | **DEFER** — daha çok data gerekli; XP scale + drop cap mevcut sistem | [`hunt.ts` XP cap, `drops.ts` DAILY_DROP_CAP] |

## 10. Curiosity & discovery (P1–P3)

| Kod | Başlık | DV | CC | Loop | Cx | LT | Karar | Kanıt |
|-----|--------|:--:|:--:|:----:|:--:|:--:|:------|-------|
| K1 | Prey-dex mystery entries | M | E | + | M | H | **IMPLEMENT** (Wave 4) — B5 ile MERGE (aynı UI) | [`prey-dex.ts`](../../../src/systems/prey-dex.ts) |
| K2 | Lore parçaları drop | M | M | + | M | M | **MERGE → D4** ve **DEFER** — içerik ağırlıklı | Rapor CU-2 |
| K3 | Gizli komut/mekanik | L | M | + | M | M | **DEFER** (Wave 6+) — spoiler kültürü etkili | Rapor CU-1 |

## 11. UX / feedback / flow (P0–P1)

| Kod | Başlık | DV | CC | Loop | Cx | LT | Karar | Kanıt |
|-----|--------|:--:|:--:|:----:|:--:|:--:|:------|-------|
| L1 | Response time budget (p95≤500ms) | H | E | + | M | H | **DEFER — zaten büyük ölçüde mevcut** | [`utils/perf-metrics.ts`](../../../src/utils/perf-metrics.ts), `hunt-hotpath-metrics.ts` |
| L2 | Cooldown auto-delete | — | — | — | — | — | **TAMAMLANDI** — `COOLDOWN_NOTICE_AUTO_DELETE_MS=8000` | [`config.ts:156`](../../../src/config.ts) |
| L3 | Görsel başarı anları | M | E | + | S | M | **DEFER** (Wave 4) — A2 ile birleşince zaten görsel vurgu var; ek scope küçük | — |
| L4 | Error mesajı dili | M | E | + | S | M | **IMPLEMENT** (Wave 1) — Yukarıda P0 | — |
| L5 | Yardım keşif kolaylığı | M | E | + | S | M | **DEFER** — mevcut help hub zaten iyi; A6/I3 ile küçük iyileştirmeler yeter | [`commands/owl-help.ts`](../../../src/commands/owl-help.ts) |

## 12. Gambling (P1)

| Kod | Başlık | DV | CC | Loop | Cx | LT | Karar | Kanıt |
|-----|--------|:--:|:--:|:----:|:--:|:--:|:------|-------|
| M1 | Görünür gamble istatistik | H | M | + | M | H | **IMPLEMENT** (Wave 3) — DDR-002 destekçisi | [`systems/gambling.ts`](../../../src/systems/gambling.ts); yeni komut `w kumar stats` |
| M2 | Session bad-luck relief | M | M | 0 | M | L | **DEFER / REJECT (ince çizgi)** — DDR-002 önerisi ile çakışabilir (retention nudge kaldırılıyorsa bu da tutarsız); audit "ince çizgi" | Audit §5 |
| M4 | Gerçek para gamble YOK | — | — | — | — | — | **KORUMA (kural)** — [`no-hidden-mechanics.mdc`](../../../.cursor/rules/no-hidden-mechanics.mdc) + gelecek [`economy-safety.mdc`](../../../.cursor/rules/economy-safety.mdc) | Rapor RW-4 |
| — | **Streak modifier revizyonu** | H | E | + | S | H | **DECISION-002 → Wave 5** | Audit P2 |

## 13. Anti-boredom / novelty (P2)

| Kod | Başlık | DV | CC | Loop | Cx | LT | Karar | Kanıt |
|-----|--------|:--:|:--:|:----:|:--:|:--:|:------|-------|
| N2 | Küçük mekanik varyasyonlar (gündüz/gece) | M | M | + | M | M | **DEFER** — LiveOps cadence altyapısı var, saatlik/haftalık varyasyon buradan | [`systems/liveops-cadence.ts`](../../../src/systems/liveops-cadence.ts) |
| J1 | Aylık tema event | M | H | + | L | H | **DEFER** (Wave 6) | — |

## 14. Metrics (P1)

| Kod | Başlık | DV | CC | Loop | Cx | LT | Karar | Kanıt |
|-----|--------|:--:|:--:|:----:|:--:|:--:|:------|-------|
| P1 | Session-length + return rate | H | M | 0 | M | H | **IMPLEMENT** (Wave 3) — retention iskeleti mevcut, event log eksik | [`retention/metrics-baseline.ts`](../../../src/systems/retention/metrics-baseline.ts) — kapsanacak |
| P2 | Frustration sinyalleri | M | M | 0 | M | M | **DEFER** (Wave 4) — event log genişletme | [`utils/guarded-discord.ts`](../../../src/utils/guarded-discord.ts) |
| P3 | Aktif quest completion oranı | M | E | 0 | M | M | **IMPLEMENT** (Wave 3) — daily-quest metrikleri | [`systems/quest-tracker.ts`](../../../src/systems/quest-tracker.ts) |
| P4 | Milestone claim istatistiği | M | E | 0 | S | M | **IMPLEMENT** (Wave 3) — C5 için input | [`hunt-milestones.ts`](../../../src/systems/hunt-milestones.ts) |
| P5 | Kısa anket ritmi | L | E | 0 | S | L | **DEFER — feedback-survey mevcut** | [`systems/feedback-survey.ts`](../../../src/systems/feedback-survey.ts) |

## 15. Yapma listesi (E4 sınırı — kural olarak)

Rapor §17 tablosu: **REJECT** olarak kesin, kural dosyalarına gömülecek. [`economy-safety.mdc`](../../../.cursor/rules/economy-safety.mdc) + [`no-hidden-mechanics.mdc`](../../../.cursor/rules/no-hidden-mechanics.mdc) + [`game-design.mdc`](../../../.cursor/rules/game-design.mdc) altına yasak listesi.

| # | Yapma | Kural dosyası |
|---|-------|--------------|
| X1 | Gerçek para RNG loot box | `economy-safety.mdc` |
| X2 | Streak kırılma görsel utandırma | `game-design.mdc` |
| X3 | Fake urgency timer | `no-hidden-mechanics.mdc` |
| X4 | Rakip zayıflatan gizli DDA | `no-hidden-mechanics.mdc` |
| X5 | Alt-account teşvikli farming | `economy-safety.mdc` |
| X6 | "Bilerek kazandır" kumar | `no-hidden-mechanics.mdc` |
| X7 | Uzun cutscene/modal | `game-design.mdc` (flow) |
| X8 | Zorunlu grup içerik | `game-design.mdc` |
| X9 | 10+ eş zamanlı quest | `game-design.mdc` |
| X10 | Kozmetik pay-only | `economy-safety.mdc` |

## 16. Karar özeti (dalga bazlı)

| Dalga | Karar tipi | Maddeler |
|-------|-----------|----------|
| **Wave 1** (P0 low-risk) | IMPLEMENT | A2, A3, A5 (doğrulama), A6, I1, L4, I3 |
| **Wave 2** (P0 medium-risk) | IMPLEMENT | A4, D2, A7, O2 |
| **Wave 3** (P1 quick + metrics) | IMPLEMENT | E4, F2, M1, P1, P3, P4 |
| **Wave 4** (P1 medium) | IMPLEMENT | B3, B5+K1 (MERGE), C2, C5 (AFTER METRICS), H4 doğrulama |
| **Wave 5** (design pivot) | DDR-001 + DDR-002 uygulaması | maintenance rework, gambling streak modifier |
| **Wave 6+** (P1/P2 büyük) | Ayrı tasarım turu | B1, B4, C1, C3, C4, D3, E1, E3, F1, G1, G3, G5, H1, H3, I2, I4, J1, K2/D4, K3, L1, L3, L5, M2, N2 |

Toplam: **~15 IMPLEMENT (Wave 1–4) + 2 DDR (Wave 5) + ~24 DEFER + 10 REJECT (kural olarak)**.

## 17. Custom list uygulama durumu (2026-09-14)

Kullanıcı onaylı liste uygulandı. Wave 6 DEFER maddeleri IWC ile mevcut mimariye oturtuldu (Prisma yok, Redis-first).

| Kod | Durum | Not |
|-----|-------|-----|
| A2–A7 | yapıldı | A2 yaklaşım, A3 cooldown hint, A4 drop tablosu, A5 kota, A6 tier, A7 welcome-back |
| B1 | IWC | Her 12 avda 1 aroma + 8 XP — yeni encounter sistemi yok |
| B3 | yapıldı | 15 dk av serisi: 25'te +%5 XP, 50'de +%10 XP |
| B4 | IWC | Tür ailesi karşı-hamle + görünür ipucu (kişilik üstüne) |
| B5+K1 | yapıldı | zoo progress + `w katalog defter` mystery |
| C2 | yapıldı | `w evrim` + stats ay çubuğu, son adım vurgusu |
| C5 | yapıldı | Milestone XP tavanı = 2 × tipik hunt XP (140) |
| D1 | IWC | Garanti av XP tabanı 8 + görünür satır; spike zaten L3 |
| D2 | yapıldı | Pity satırı |
| D3 | IWC | Kazanılabilir unvanlar (güç yok) |
| D4+K2 | yapıldı | İlk keşif lore satırı |
| E3 | kaldırıldı | Hedef seçimi +%25 oyuncuya karışıktı; 4 görev + claim kaldı |
| E4 | kaldırıldı | Bugünkü hedef satırı da gitti |
| F1 | yapıldı | `w trade log` — yalnızca kendi geçmişin |
| F2 | yapıldı | Piyasa sinyal aralığı (kilit değil) |
| G3 | yapıldı | `w kudos` kaç kişi / `w kudos @oyuncu` 20 dk, ödül yok |
| G5 | yapıldı | `w mentor ol/iste` — eşleşme only, coin yok |
| H1 | IWC | İlk 30 dk / 5. avda +40 XP + unvan |
| H3 | yapıldı | İlk 3 av rehber satırı |
| H4 | doğrulandı | 7 gün retention 0 + görünür bonus + help |
| I1–I4 | yapıldı | Hediye dili, haftalık ritüel, silent streak, softening |
| K3 | yapıldı | Defter tamam → bir kez gizli satır + unvan |
| L1 | IWC | Hunt >500 ms `hunt_over_budget` sayacı |
| L2–L5 | yapıldı / korundu | |
| M1 M2 M4 | yapıldı / koruma | |
| N2 | yapıldı | Sabah XP / gece nadir — satır görünür |
| P1–P4 | yapıldı | Redis agregat |
| P5 | kaldırıldı | `w anket` silindi; feedback-survey duruyor |

**Belge sonu.** Detay dalga sıralaması: [`IMPLEMENTATION_ROADMAP.md`](IMPLEMENTATION_ROADMAP.md).
