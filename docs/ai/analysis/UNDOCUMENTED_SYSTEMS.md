# UNDOCUMENTED_SYSTEMS — Kodda Var, Research Belgelerinde Yok/Kısa

> Kod okumasında bulunan ama research belgelerinde ya hiç geçmeyen ya da tek satır değinilen sistemler. Bunlar mevcut ekonomi, retention veya deneyimi doğrudan etkiler; yeni özellik önerileri bunları göz ardı edemez.
>
> Amaç: gelecek dalgada "ne olduğunu bilmediğim bir sistem" sürprizi olmasın.

---

## 1. Anticheat pipeline — reward-throttle

- **Kod:** [`src/anticheat/reward-throttle.ts`](../../../src/anticheat/reward-throttle.ts) — `applyRewardMultiplier(prisma, {userId, guildId, rewardType}, amount)`.
- **Ne yapar:** Hunt XP, PvP XP gibi ödüllere anti-farm throttle uygular. Zorunlu; yeni ödül kanalları bu API'den geçer.
- **Research boşluğu:** action-list P1-P5 metrik bölümleri anticheat'i ele almıyor; yalnızca X5 (alt-account) kısa değiniyor.
- **Etki:** Wave 3 metriklerinde reward-throttle sayaçları veri kaynağı olacak.

## 2. Anticheat suite (rate/trust/captcha/multi-account/market-anomaly)

- **Kod:** [`src/anticheat/`](../../../src/anticheat/) — 20+ dosya, modüler klasör.
- **Ne yapar:** Redis token bucket, trust score, captcha challenge, market anomaly detection, multi-account heuristics.
- **Research boşluğu:** [`OwlHunt_AntiCheat_AntiSpam_Brief.md`](../../../OwlHunt_AntiCheat_AntiSpam_Brief.md) mevcut ama research/ üçlüsünden ayrı.
- **Etki:** Yeni özellik eklerken (özellikle ödül ver-al) anticheat gate atlanmaz.

## 3. Ops panel (localhost HTTP + copy editor + analytics)

- **Kod:** [`src/ops-panel.ts`](../../../src/ops-panel.ts) + [`src/ops/`](../../../src/ops/).
- **Ne yapar:** 127.0.0.1 HTTP sunucu; Discord OAuth; kopya (metin) editörü; feedback/analytics endpoint'leri.
- **Research boşluğu:** Belgelerde geçmiyor; sadece [`docs/CADDY_OPS_PANEL.md`](../../CADDY_OPS_PANEL.md) mevcut.
- **Etki:** UI metin ayarları canlıda ops panel üzerinden değişir. Yeni copy eklenirken [`config/copy-catalog*.ts`](../../../src/config/copy-catalog.ts) hesaba katılmalı.

## 4. LiveOps cadence

- **Kod:** [`src/systems/liveops-cadence.ts`](../../../src/systems/liveops-cadence.ts) — saat/gün/hafta bazlı hunt XP bonusu (weekend, festival).
- **Ne yapar:** `currentLiveOpsModifier()` → `{ huntBonusRate, label }`. Hunt sonucu `+X XP` satırı olarak gösteriliyor.
- **Research boşluğu:** action-list N2/J1 event varyasyonu genelinden geçiyor ama mevcut altyapıyı bilmiyor.
- **Etki:** N2/J1 önerilerinin yeri hazır — yeni dosya değil, bu sistemi genişletmek doğru.

## 5. Social retention (aynı kanaldaki oyunculara mikro-bonus)

- **Kod:** [`src/systems/social-retention.ts`](../../../src/systems/social-retention.ts) — `applySocialHuntBonuses(prisma, redis, userId, guildId, channelId, mult)`.
- **Ne yapar:** Aynı kanalda başkası da hunt yapıyorsa küçük XP bonusu ve satır. `retentionTuningForUser` bucket'a göre çarpan.
- **Research boşluğu:** RE-1/RE-2 relatedness genelinden geçiyor, mekaniği bilmiyor.
- **Etki:** G1 (guild kolektif hedefi) tasarımı bu API'den yararlanabilir.

## 6. Retention A/B bucket + tuning

- **Kod:** [`src/systems/retention/abtest.ts`](../../../src/systems/retention/abtest.ts) — SHA1 tabanlı A/B bucket, `socialBonusMult` gibi tuning değerleri.
- **Ne yapar:** Yeni özellik ekonomik güvenlik için A/B ile ölçülebilir.
- **Research boşluğu:** Belgeler A/B test'i P5 anket bağlamında geçiyor; mevcut altyapı daha güçlü.
- **Etki:** Wave 3 P1/P3 metriklerinde ve DDR-002/003'te değerlendirme aracı.

## 7. Churn score + player-activity

- **Kod:** [`retention/churn-score.ts`](../../../src/systems/retention/churn-score.ts), [`retention/player-activity.ts`](../../../src/systems/retention/player-activity.ts).
- **Ne yapar:** `safe / at_risk / churning` bucket'ı; session-loss tracking; `consumeReturnBonusUse` (tek seferlik geri dönüş bonusu).
- **Research boşluğu:** action-list retention bölümü churn-safe bonuslardan bahsediyor ama mevcut tier yapısını bilmiyor.
- **Etki:** DDR-002'de gambling nudge'ı çekilirse hunt/tame nudge'ı bu yapıdan geliyor.

## 8. Reengagement queue

- **Kod:** [`src/systems/reengagement.ts`](../../../src/systems/reengagement.ts) — 3+ gün inaktif oyuncuları Redis kümesine alır (400 batch, 24h TTL).
- **Ne yapar:** Şu an sadece kuyruk; **kullanıcıya iletim mekanizması yok** (DM/mention).
- **Research boşluğu:** RT-3/RT-4 grace-friendly return önerileri var ama mevcut queue'yu bilmiyor.
- **Etki:** A7 (welcome-back pack) Wave 2'de bu queue'yu tetik olarak kullanabilir.

## 9. Sell rollback

- **Kod:** [`src/systems/sell-rollback.ts`](../../../src/systems/sell-rollback.ts) + [`config/sell-rollback.ts`](../../../src/config/sell-rollback.ts) + [`utils/sell-telemetry.ts`](../../../src/utils/sell-telemetry.ts).
- **Ne yapar:** Yanlış / hızlı sat sonrasında telafi mekanizması.
- **Research boşluğu:** Hiç geçmiyor.
- **Etki:** F2 (market fiyat sinyali) tasarımında ekonomik güvenlik referansı.

## 10. Feedback-survey pipeline

- **Kod:** [`src/systems/feedback-survey.ts`](../../../src/systems/feedback-survey.ts) + [`config/feedback-survey.ts`](../../../src/config/feedback-survey.ts) + [`ops/feedback-handlers.ts`](../../../src/ops/feedback-handlers.ts).
- **Ne yapar:** Periyodik mikro-anket, ops panel entegrasyonu.
- **Research boşluğu:** P5 anket önerisi var ama pipeline mevcut olduğunu bilmiyor.
- **Etki:** P5 için ekstra bir sistem gerekmez; ritim ayarı yeter.

## 11. Rebalance compensation

- **Kod:** [`src/systems/rebalance-compensation.ts`](../../../src/systems/rebalance-compensation.ts) + reminder.
- **Ne yapar:** Balance değişikliği sonrası oyuncuya telafi verme sistemi.
- **Research boşluğu:** O2 (changelog süreci) telafiyi çağırıyor ama mevcut sistem tam olarak bunu yapıyor.
- **Etki:** Wave 2 O2 iş kalemi kısmen bu sistemin yazılı sürecine dönüşecek — kod eklenmez.

## 12. Copy catalog + copy-overrides.json

- **Kod:** [`src/config/copy-catalog.ts`](../../../src/config/copy-catalog.ts) + `copy-catalog-extended.ts` + kök [`copy-overrides.json`](../../../copy-overrides.json).
- **Ne yapar:** Oyuncu görünen metinler burada; ops panel üzerinden düzenlenebilir.
- **Research boşluğu:** Hiç geçmiyor.
- **Etki:** Wave 1'de I1 (daily reward dili), L4 (error dili), A3 (cooldown mesajı) copy sistemine dokunacak — kod eklerken çift yönlü değişiklik olabilir.

## 13. LOOTBOX_DEF_MAP + Custom emojis

- **Kod:** [`config/custom-emojis.ts`](../../../src/config/custom-emojis.ts), lootbox definitions.
- **Ne yapar:** Kutu ID → emoji + isim eşleme.
- **Research boşluğu:** D3 kozmetik reward önerisinde altyapı olarak referans verilmiş, detay yok.

## 14. Middleware pipeline (flow-inflight, flow-intent, abuse-breaker, load-shed)

- **Kod:** [`src/middleware/`](../../../src/middleware/) — komut pipeline'ı.
- **Ne yapar:** Cooldown, inflight tracking, intent detection, abuse breaker, load shedding.
- **Research boşluğu:** L1 response time öneriyor ama pipeline'ın kendisini bilmiyor.

## 15. Hunt hotpath metrics

- **Kod:** [`src/utils/hunt-hotpath-metrics.ts`](../../../src/utils/hunt-hotpath-metrics.ts) — hunt sırasında Redis/PG read/write sayaçları.
- **Ne yapar:** Perf regression tespit.
- **Research boşluğu:** L1 response time budget için altyapı.

## 16. Buff / consumable system

- **Kod:** [`src/systems/items.ts`](../../../src/systems/items.ts) — `getBuffEffects`, `drainBuffCharge`, `getCachedHuntBuffDisplay`.
- **Ne yapar:** Aktif buff bookkeeping, charge drain, display hazırlama.
- **Research boşluğu:** Belgeler use/buff'a değiniyor ama çoklu buff + diminishing returns kalıbını görmemiş.

## 17. XP scale + level curve

- **Kod:** [`src/utils/math.ts:finalXP`](../../../src/utils/math.ts) + `XP_SCALE_RATE`, `XP_SCALE_MAX_MULT` config'ler.
- **Ne yapar:** Level'e göre XP kazanç çarpanı ve cap.
- **Research boşluğu:** action-list I4 (daily softening) buradan yararlanabilir ama bilmiyor.

## 18. Ordered locks / financial lock

- **Kod:** [`src/utils/lock.ts:withLock`](../../../src/utils/lock.ts) + `ordered-locks.test.ts`.
- **Ne yapar:** Deadlock önleme + tek finansal kilit tüm ekonomik yollar için.
- **Research boşluğu:** Hiç yok. Yeni özellik bu kilidin kalıbını takip etmeli.

## 19. Trait pool + rarity weighting

- **Kod:** [`src/systems/traits.ts:rollTraits`](../../../src/systems/traits.ts) + `OWL_TRAITS` + `RARITY_TRAIT_WEIGHT_MULT`.
- **Ne yapar:** Owl trait sistemi + rarity-based weight.
- **Research boşluğu:** action-list §3 trait sistemine değiniyor ama detayı bilmiyor.
- **Etki:** DDR-005 (tame prey-family) ve gelecek autonomy tartışması bu sistemin üstüne yazacak.

## 20. Prey-dex

- **Kod:** [`src/systems/prey-dex.ts`](../../../src/systems/prey-dex.ts) + `syncPreyDexFromHistory`.
- **Ne yapar:** Ömür boyu av keşif kaydı; envanter/satış geçmişinden otomatik senkronizasyon.
- **Research boşluğu:** action-list B5/K1 katalog altyapısını bilmiyor ama önerileri buraya yerleşiyor.

## 21. Community-Discord tetikleyicileri

- **Kod:** [`src/utils/community-discord.ts`](../../../src/utils/community-discord.ts) — `maybeAppendLevel5DiscordHint`, `buildHelpDiscordFooter`.
- **Ne yapar:** Level 5 sonrası Discord tarafına yumuşak yönlendirme.
- **Research boşluğu:** Hiç yok.

## 22. Onboarding pipeline

- **Kod:** [`src/systems/onboarding.ts`](../../../src/systems/onboarding.ts) — `markFirstHuntComplete`, ilk kutu, ilk sat, ilk upgrade tetikleyicileri.
- **Ne yapar:** İlk oturum ipuçları + kutu drop.
- **Research boşluğu:** H1 (30 dk happy path) burada zaten kısmen; genişletme değil, mevcut refactor.

---

## Kullanım

Yeni feature planı yazılırken bu belge kontrol edilmeli. Aşağıdakilerden biri iddia edilirse **STOP:**

- "Yeni bir anticheat / retention / metrics sistemi kuralım" → var, bu belgeye bak.
- "Copy overrides / metin ayarı ekleyelim" → var, ops panel + copy-catalog.
- "LiveOps event sistemi kuralım" → altyapı var, sadece içerik ekle.
- "Ödül kanalı ekleyelim, throttle yazalım" → reward-throttle mevcut, `applyRewardMultiplier` kullan.

**Belge sonu.**
