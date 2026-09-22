# DECISION-009 — Rün sistemi (kalıcı trained stat)

- **Durum:** Uygulandı (deploy + emoji ID ayrı)
- **Tarih:** 2026-09-14
- **Kaynak:** Kullanıcı tasarımı (tame/savaş drop, tek kullanımlık kesin apply)

---

## Problem

Encounter (tame / savaş) sonrası kalıcı güç ilerleme kanalı yoktu; loot çoğu tüketilebilir.

## Karar

1. **Drop:** Düşük gate (tame %8, fight %10) + rarity ağırlığı (güçlü taş daha nadir). Zayıf düşmandan efsanevi mümkün ama düşük.
2. **Apply:** Tek seferlik, fail RNG yok; main baykuş `*Trained` artar.
3. **Spread muafiyeti:** Upgrade spread kilidi rün apply’de yok — aksi halde yüksek DEF rünleri kilitlenirdi.
4. **Schema:** Migrate yok; sayaç Redis `rune:applied:{owlId}`; item `InventoryItem` `itemType: Rün`.
5. **Stat map:** ATK→Pençe, DEF→Gaga, SPD→Kanat, CRT→Göz.

## Ekonomi

Kalıcı power source — gate düşük tutuldu; efsanevi ~%1 (gate sonrası, çarpanlarla daha da az).
