# DECISION-002 — Gambling Streak Modifier ve Retention Nudge

- **Durum:** Önerilen (Wave 5 kod uygulaması onay bekliyor)
- **Tarih:** 2026-09-14
- **Kaynaklar:** [`docs/research/owlhunt-core-design-audit.md §5`](../../research/owlhunt-core-design-audit.md), P2 (kategori A+E) · [`DESIGN_CODE_CONFLICTS.md §2, §5`](../analysis/DESIGN_CODE_CONFLICTS.md)

---

## Problem

Kumar minigames (coinflip, blackjack, slot, duelbet, PvP gamble) üç gizli mekanizma içeriyor:

1. **Streak modifier** — 3+ art arda kazandıysan sonraki oynayışta win chance −2% ile −5% arası **azalır**; 3+ art arda kaybettiysen +3% ile +5% arası **artar**. Oyuncu bunu **bilmiyor**.
2. **Retention nudge** — `getGambleRetentionBonusSafe` churn tier'a göre (`at_risk` %2, `churning` %4) + return bonus %2 daha ekler. Bu da **oyuncuya söylenmiyor**.
3. **Gösterilmemiş RTP** — Coinflip 95.55%, Slot ~45%, BJ ~99%. Yayınlanmıyor.

**Sonuç:** Sistem sofistike ama etik olarak paternalist. Kullanıcı şikayeti ("10 elde 1 kere bile kazanamadım") tam bu **rubber-band + gizlilik** kombinasyonunun ürettiği hissi işaretliyor — kullanıcı **doğru sezdi**, sistem gerçekten kendisinden bağımsız modifiye ediyor.

## Existing System

- Streak modifier: [`src/systems/gambling.ts:streakModifier`](../../../src/systems/gambling.ts) (WIN_3=-2, WIN_5=-5, LOSS_3=+3, LOSS_5=+5).
- Retention nudge: [`retention-modifiers.ts:getGambleRetentionBonusSafe`](../../../src/systems/retention/retention-modifiers.ts).
- Uygulama zinciri: `settleGamble` → `streakModifier + retentionMod → finalWinChance(base, coins, bet, modifier)`.

## Proposed Change

### Ana karar

**Streak modifier'ı kaldır** (`streakModifier` fonksiyonu ve sabitleri).

**Retention nudge'ı gambling'den çek** (`getGambleRetentionBonusSafe` bu kanalda çağrılmasın; hunt/tame'de kalabilir).

**RTP'yi görünür yap.** `w kumar stats` alt-komutu + `w yardim kumar` sayfasında oran gösterimi.

### Detay adımlar

1. `settleGamble` içindeki `streakModifier` çağrısı kaldırılır; `retentionMod` çağrısı da bu path'ten kalkar.
2. Config'te `GAMBLE_STREAK_*` sabitleri "deprecated" olarak markalanır (deleted olabilir; ancak referans varsa yumuşak geçiş).
3. `gambleStreakWins/Losses` Player alanları kalır — istatistik göstermek için.
4. Yeni `w kumar stats` komutu (veya mevcut `bj/cf/slot` handler'a alt komut):
   - Kişisel oyun sayısı, kazanma oranı
   - Bot RTP oranları (`Coinflip: %95.55 · Slot: ~%45 · BJ: ~%99`)
   - Cümle: "Uzun vadede kumar coin kaybettirir. Sınırını sen belirle."
5. `w yardim kumar` sayfasına oran + politika satırı eklenir.

### Bad-luck relief (M2) tartışması

Audit ve action-list M2 kaybeden oyuncuya küçük bakiye koruma öneriyor. **Bu turda REJECT**:
- Streak modifier'ı kaldırdıktan sonra tekrar tersine benzer bir gizli mekanizma eklemek tutarsız.
- İnce çizgi (audit uyarısı): telafi çok büyükse "kaybettikçe kazanç hissi" (Bäcklund escape motivation).
- Alternatif: eğer kullanıcı geri bildirimi "çok kaybediyorum" ısrarcı ise **görünür daily gamble loss cap** düşünülebilir (ayrı DDR).

## Alternatives

- **(a) Modifier'ı kaldır + retention nudge kaldır (ÖNERİLEN)** — En net etik pozisyon.
- **(b) Modifier'ı görünür yap** — "kayıp serisi bonusu +5%" hunt sonucunda gösterilir. Şeffaflık artıyor ama tasarım tutarsızlığı sürüyor (VR + adjustment).
- **(c) Sadece asimetrik: sadece loss protection (LOSS_3/5 kalsın), win dampening (WIN_3/5) kaldırılsın** — kısmi çözüm; hâlâ gizli, yalnızca kayıp yönünde yumuşatılmış.
- **(d) Hiçbir şey yapma (status quo)** — kullanıcı şikayeti sürer; algılanan adalet çöker; uzun vadede güven kaybı.

## Research Evidence

- King, Delfabbro & Griffiths (2010) — "reward and punishment features" içinde streak-based dinamikler yapısal risk faktörü olarak listeleniyor.
- Mortazavi vd. (2024) — DDA meta-analizi; rubber-band pattern autonomy + competence yıkıcı olarak belgelenmiş.
- Ryan & Deci (2020) — algılanan adalet SDT autonomy zemininde şart; gizli modifier autonomy'yi doğrudan yıkar.
- Bäcklund vd. (2022) — emotional escape motivasyonu problem gaming ile en güçlü ilişkiye sahip; kumar dinamiği bu motivasyona hitap eder.
- Deci & Ryan (2020) — external regulation (bu durumda paternalist iç mekanizma) intrinsic motivasyonu aşındırır.

## Technical Impact

- Dosyalar: [`systems/gambling.ts`](../../../src/systems/gambling.ts), [`systems/gamble/settle.ts`](../../../src/systems/gamble/settle.ts) (varsa), [`systems/retention/retention-modifiers.ts`](../../../src/systems/retention/retention-modifiers.ts) (gamble path'i temizle), [`utils/math.ts:finalWinChance`](../../../src/utils/math.ts) (imza kontrol; modifier parametresi opsiyonel ya da 0'a düşer), [`commands/coinflip.ts`](../../../src/commands/coinflip.ts) + `bj.ts` + `owl-help.ts`.
- Yeni komut: `w kumar stats` (veya `w gamble stats`).
- Test: `src/__tests__/gamble-settle.test.ts` — modifier kaldırıldıktan sonra RTP değişmiyor mu doğrula; property test.
- Ekonomi etkisi: **hafifçe pozitif** — modifier + retention nudge oyuncu lehine mikro-etki yaratıyordu; kaldırılınca house edge azıcık yükselir. Kalibre etmek istersen `GAMBLE_COINFLIP_PAYOUT`'u 1.95 → 1.96 gibi yumuşat.

## Design Impact

- Oyuncu deneyimi: **algılanan adalet artar**; "sistem hile yapmıyor" hissi.
- Kullanıcı şikayeti kök nedene doğrudan cevap.
- Loop'un genel şeffaflık duruşu ile tutarlı (DDR-003 pity şeffaflığı ile birlikte).

## Long-Term Impact

- **Riskler:**
  - Kayıp serisinde oyuncu daha çok kaybedebilir (rubber-band ışığı yok). Karşı önlem: opsiyonel görünür daily gamble loss cap (M2 yerine).
  - Retention nudge kaldırıldığı için churn-at-risk oyuncularda kumar üzerinden geri kazanma etkisi düşer. Karşı önlem: hunt/tame nudge'ları kalıyor — retention buradan geliyor.
- **Kazanımlar:**
  - Uzun vadede oyuncu güveni; audit'in "bot sahtekar" izlenimini kaldırma.
  - Coin-only kumar sınırının etik iç yüzü sağlamlaşır.

## Decision

**REWORK — Alternatif (a):**

1. `streakModifier` kaldır.
2. Retention nudge gambling path'inden çekilir (hunt/tame'de kalır).
3. RTP görünür yap: `w kumar stats` + `w yardim kumar`.
4. M2 bad-luck relief **REJECT** (bu turda).

**Uygulanma turu:** Wave 5 (ayrı kullanıcı onayı). Bu turda kod dokunulmuyor.

## Reason

Kanıt üç kaynaktan aynı yön: SDT autonomy + DDA meta + kumar literature. Kullanıcı şikayeti direct link. Alternatif (b) yarı çözüm — gizlilik sürer; (c) hâlâ gizli; (d) status quo → güven erozyonu. Coin-only sınır zaten dark-pattern'ın iç tarafındaysa, iç mekanik de temiz olmalı — sistem bütünlüğü.

## Metrikler (Wave 5 sonrası ölçülecek)

- Kumar oyun sayısı (öncesi/sonrası, agregat)
- Kumar geliri (house edge net)
- Feedback survey "adalet" skoru
- Kumar-only oynayan oyuncu ayak izinde değişim
- Support ticket'ında "hile" şikayeti oranı

## Bağı

- [`DECISION-003-pity-and-softcap-transparency.md`](DECISION-003-pity-and-softcap-transparency.md) — aynı şeffaflık disiplini hunt'ta
- [`../../.cursor/rules/no-hidden-mechanics.mdc`](../../../.cursor/rules/no-hidden-mechanics.mdc) — bundan sonra yeni gizli modifier eklenemez (kural)

**Belge sonu.**
