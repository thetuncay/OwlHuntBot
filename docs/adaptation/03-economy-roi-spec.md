# OwlHunt Economy & Command ROI Spec

**Amaç:** klasik bot benchmark değil; OwlHunt ekonomisinin sağlığını ölçmek ve denge kararlarını veriye bağlamak.

## Mevcut altyapı

| Bileşen | Dosya / model |
|---------|----------------|
| Komut telemetry | `CommandEvent` — [`prisma/schema.prisma`](../prisma/schema.prisma) |
| Batch yazım | [`src/utils/command-telemetry.ts`](../src/utils/command-telemetry.ts) |
| Hunt ödülleri | `HUNT_*`, `HUNT_ITEM_DROPS` — [`src/config.ts`](../src/config.ts) |
| Gamble | `GAMBLE_*`, `GAMBLE_COINFLIP_PAYOUT` |
| Duel cap | `DUEL_DAILY_COIN_CAP` |
| Quest öneri | `legacy-insights.json` → `economyRecommendations` |

## Önerilen şema genişlemesi

### `CommandEvent` (kısa vadeli — migration gerekir)

```prisma
model CommandEvent {
  // mevcut alanlar...
  normalizedIntent String?  // hunt, duel, cf, ...
  sourcePrefix     String?  // wh, wb, owl, slash
  sessionId        String?  // aynı kullanıcı 30dk penceresi
}
```

### `EconomyLedger` (orta vadeli)

| Kolon | Tip | Açıklama |
|-------|-----|----------|
| id | uuid | |
| userId | string | |
| guildId | string | |
| intent | string | hunt, duel, cf, ... |
| sourceType | enum | command_reward, gamble_win, gamble_loss, shop_buy, transfer, quest, admin |
| coinDelta | int | + üretim, − sink |
| itemKey | string? | |
| itemQty | int? | |
| metadata | json | streak, bet, multiplier |
| createdAt | datetime | |

## Source / Sink sınıflandırması

### Sources (coin üretimi)

| Kaynak | Intent | Not |
|--------|--------|-----|
| Hunt loot sell | hunt, sell | Ana grind |
| Duel win | duel | `DUEL_DAILY_COIN_CAP` ile sınırlı |
| Quest complete | quests | Günlük görev |
| Gamble win | cf, bj, slot | Riskli; streak penalty |
| Transfer in | ver | Sosyal, izlenmeli |
| Daily/login | quests | klasik bot median ~5k referans |

### Sinks (coin tüketimi)

| Sink | Intent | Not |
|------|--------|-----|
| Upgrade | upgrade | Stat sink |
| Shop / market | buy, market | |
| Gamble loss | cf, bj, slot | |
| Craft / dismantle | craft, dismantle | Item dönüşümü |
| Transfer out | ver | |
| PvP house cut | vs, cf (pvp) | `PVP_GAMBLE_HOUSE_CUT_BASE` |

## Command ROI metrikleri

Her `intent` için günlük rollup (view veya materialized):

| Metrik | Formül | Hedef bant |
|--------|--------|------------|
| `commands_per_dau` | events / DAU | segment bazlı |
| `coin_per_command` | sum(coinDelta) / count | hunt: pozitif düşük; cf: ~0 uzun vadede |
| `net_roi` | (wins − bets) / bets | gamble: −2% .. +2% (house edge) |
| `time_to_next` | p50 gap aynı intent | hunt ~20-30s |
| `loop_completion_rate` | hunt→duel→hunt zinciri / hunt | ≥ 35% |
| `sink_source_ratio` | total_sink / total_source | 0.85 – 1.15 (enflasyon kontrolü) |

### Risk-ödül skoru (gamble)

```
risk_reward_index = (payout_multiplier × win_rate) - 1
```

Mevcut coinflip: `win_chance=49%`, `payout=1.95` → beklenen ~−4.5% (kasıtlı house edge).

## Dashboard KPI seti (“OwlHunt Health”)

1. **Engagement:** DAU, commands/user/day, peak hour UTC.
2. **Loop:** hunt→duel transition rate, ortalama session depth.
3. **Economy:** sink/source ratio, top 1% wealth share, `DUEL_DAILY_COIN_CAP` hit rate.
4. **Parser QC:** noise%, parseCoverageClean (MetaLab script).
5. **Segment:** grind / gamble / hybrid dağılımı.

## klasik bot veriden OwlHunt parametre referansları

| klasik bot gözlem | OwlHunt mevcut | Öneri |
|------------|----------------|-------|
| Hunt p50 gap 23s | `HUNT_COOLDOWN_MS=15s` | 15s koru; UX’te “~20s” beklentisi metinle |
| Duel p50 gap 29s | `SIM_PVP_COOLDOWN_MS=15s` | Duel spam koruması yeterli |
| Cf p50 gap 19s | `GAMBLE_*_COOLDOWN_MS=5s` | Soft decay ekle (design doc #4) |
| Daily→cf bigram | quest→cf hint | `flowHints.afterQuests` kullan |
| klasik bot daily median 5k | quest coin | `suggestedQuestTotalCoins=4500` yakın |

## Alarm eşikleri

| Alarm | Koşul | Aksiyon |
|-------|-------|---------|
| Enflasyon | sink/source < 0.7 (7 gün) | Quest ödülü −%10, shop fiyat +%5 |
| Gamble drain | cf net_roi < −15% (24s) | Streak penalty sıkılaştır |
| Parser drift | parseCoverageClean < 88% | Alias tablosu güncelle |
| Whale | top10 net share > 40% | Transfer limit / vergi |

## Uygulama sırası

1. `logCommandEvent` → `normalizedIntent` ekle (kod değişikliği, migration).
2. Hunt/duel/gamble sonrası `EconomyLedger` yazımı (hot-path async queue).
3. Günlük rollup cron (worker).
4. Admin `owl sys economy` özeti (read-only metrik).
