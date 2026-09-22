# MetaLab Dataset QC Report (OwlHunt Parser Rules)

**Kaynak:** `metala-data/metalab-compiled/metalab-compiled.db`  
**Üretim:** `python3 scripts/metalab-qc.py` → `metala-data/metalab-compiled/qc-report-latest.json`  
**Tarih:** 2026-06-03

## Özet

| Metrik | Değer |
|--------|-------|
| Toplam kullanıcı komutu | 147,289 |
| Gürültü (bot metni / embed / URL) | 75,018 (%50.93) |
| Temiz satır | 72,271 |
| Parse edilen intent | 61,801 |
| Temiz içinde unknown | 10,470 (%14.49) |
| **Temiz satır parse coverage** | **%85.51** |
| Ham satır parse coverage | %41.96 |

Ham coverage düşük görünse de bunun ana nedeni veri setine **klasik bot bot cevaplarının kullanıcı komutu gibi kaydedilmesi** (ör. `**🌱`, uzun help/rules metinleri). Gürültü filtresi sonrası metrik anlamlı hale gelir.

## Kalite hedefleri (OwlHunt telemetry için)

| KPI | Mevcut (MetaLab) | Hedef (OwlHunt prod) |
|-----|------------------|----------------------|
| `noisePct` | 50.93% | **≤ 5%** |
| `parseCoverageClean` | 85.51% | **≥ 92%** |
| `unknownPctClean` | 14.49% | **≤ 8%** |

## Gürültü sınıfları

1. **Bot reply as command** — `is_bot_response=0` iken bot embed/metni (`Here is the list...`, rules bloğu).
2. **Markdown/emoji prefix** — `**🌱`, `**🙏`, custom Discord emoji tokenları.
3. **Sohbet / mention** — kullanıcı adı, serbest metin (`okan`, `these`).
4. **Eşleşmemiş reply pairing** — `reward_expectation` export’unda tüm satırlar `reward_type=other`, delay p50 > 3 saat (pairing kırık).

## Temiz veride en güçlü intent’ler

| Intent (OwlHunt) | Adet |
|------------------|------|
| hunt | 17,013 |
| duel | 10,230 |
| cf | 8,600 |
| cash | 6,535 |
| sell | 4,498 |
| bj | 4,300 |
| buffs | 2,856 |
| quests | 2,777 |

## Prefix / alias kullanımı (klasik bot → OwlHunt geçiş kanıtı)

| Prefix | Adet |
|--------|------|
| wh | 15,369 |
| wb | 9,275 |
| wcf | 1,938 |
| ws | 2,015 |
| wbj | 1,767 |
| w (ayrık) | 17,345 |
| legacy | 10,464 |

**Sonuç:** Kısa prefix + yapışık alias (`wh`, `wb`) zorunlu; sadece `owl hunt` beklemek gerçek kullanımın ~%60’ını kaçırır.

## Komut aralığı (temiz intent, ≤1 saat gap)

| Komut | p50 | p75 | p90 |
|-------|-----|-----|-----|
| hunt | 23s | 50s | 171s |
| duel | 29s | 72s | 289s |
| cf | 19s | 41s | 131s |
| bj | 19s | 38s | 101s |
| sell | 23s | 73s | 302s |
| buffs | 559s | 1263s | 2371s |

OwlHunt mevcut hunt cooldown **15s** — veri p50 **23s** ile uyumlu (oyuncu biraz daha yavaş veya araya başka komut giriyor).

## Geçiş akışları (top)

| From → To | Count |
|-----------|-------|
| hunt → duel | 7,918 |
| duel → hunt | 5,752 |
| hunt → sell | 711 |
| duel → buffs | 576 |

## Oyuncu segmentleri (≥30 parse edilmiş komut)

| Segment | Kullanıcı |
|---------|-----------|
| grind_heavy | 84 |
| gamble_heavy | 66 |
| hybrid | 36 |
| economy_heavy | 7 |

## OwlHunt için QC pipeline önerisi

```
raw_message
  → is_bot_response filter (kaynakta)
  → noise classifier (length, markdown, URL, emoji-only)
  → stripGluedPrefix(guildPrefix)
  → normalizeCommandToken (klasik bot alias tablosu)
  → ALIASES (OwlHunt internal)
  → intent + telemetry
```

## Aksiyon maddeleri

1. MetaLab ingest’te `is_bot_response` ve author bot check zorunlu.
2. `reward_expectation` üretiminde command→reply eşlemesini 60s pencerede yap; boş eşleşmeyi `unmatched` olarak say, `other` ile karıştırma.
3. OwlHunt `CommandEvent`’e `rawPrefix` + `normalizedIntent` kolonları ekle (spec: `03-economy-roi-spec.md`).
4. Haftalık `scripts/metalab-qc.py` veya eşdeğeri ile regression.
