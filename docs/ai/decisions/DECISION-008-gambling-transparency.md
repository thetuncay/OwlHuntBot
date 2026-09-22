# DECISION-008 · Kumar şeffaflığı — gizli mekaniği kaldırmak yerine görünür kıl

**Durum:** IMPLEMENT (M1 + M2)
**Tarih:** 2026-09-14
**İlgili:** `DECISION-002` (gambling streak modifier), action list M1 · M2 · M4

---

## Problem

Kumar kazanma şansı **dört gizli değiştiriciden** geçiyordu ve hiçbiri oyuncuya
gösterilmiyordu:

| Değiştirici | Kaynak | Etki |
|---|---|---|
| Kayıp/kazanç serisi | `gambling.ts:streakModifier` | 3 kayıpta +3, 5 kayıpta +5 · 3 kazançta −2, 5 kazançta −5 |
| Zenginlik cezası | `math.ts:gamblingRichPenalty` | `log10(1+coins)`, en fazla −15 |
| Bahis oranı cezası | `math.ts:gamblingBetPenalty` | `(bahis/bakiye) × 5` |
| Retention bonusu | `retention-modifiers.ts` | Değişken ek puan |

Coinflip'in ilan edilmemiş temel şansı %49 iken, gerçek şans oyuncunun
durumuna göre kabaca %30–%57 arasında değişiyordu. Bu, `no-hidden-mechanics`
kuralının doğrudan ihlaliydi.

## Mevcut sistem

- Şans hesabı `finalWinChance` içinde tek noktada toplanıyor (iyi).
- Ama `streakModifier` `gambling.ts` içinde **yerel** tanımlıydı; UI'ın erişimi yoktu.
- Ömür boyu win/loss verisi hiçbir yerde tutulmuyordu. `AuditLog` tek tek olayları
  yazıyor ama toplama için taranması pahalı ve loglar budanabilir.

## Önerilen değişiklik

DECISION-002 gizli rubber-band'in **kaldırılmasını** öneriyordu. Kullanıcı bu kalemi
kapsam dışı bıraktı; onun yerine M1 (görünür istatistik) ve M2 (görünür bad-luck
relief) seçildi.

Kritik gözlem: **M2'nin istediği koruma zaten kodda var.** `GAMBLE_STREAK_LOSS_3/5`
tam olarak "kayıp serisinde küçük telafi" demek. Yeni mekanik eklemeye gerek yok —
mevcut olanı görünür kılmak yeterli.

Uygulanan:

1. `streakModifier` → `gamble/win-chance-explain.ts:streakChanceModifier` olarak
   dışa taşındı. `gambling.ts` artık bu tek kaynağı kullanıyor.
2. `explainWinChance` — nihai şansı **gerçek formülü çağırarak** bileşenlere ayırır.
   Formül tekrarlanmaz, dolayısıyla ilan edilen açıklama koddan sapamaz.
3. `w kumar` ekranı — oyuncunun kendi win/loss oranı + o an aktif olan değiştiriciler.
4. Kayıp serisi koruması aktifken coinflip sonucuna tek satır eklenir (M2).
5. Sayaçlar Redis hash'te (`gstats:{userId}`), 180 gün TTL yenilemeli.

## Alternatifler

| Alternatif | Neden seçilmedi |
|---|---|
| DECISION-002'yi uygula (gizli modifier'ı kaldır) | Kullanıcı kapsam dışı bıraktı. Şeffaflık, kaldırmanın yerine geçebilir. |
| Yeni `GambleStat` Prisma tablosu | Migration riski; veri ekonomi-kritik değil, salt bilgi. |
| `AuditLog` üzerinden toplama | Her görüntülemede tarama pahalı; loglar budanırsa sayı düşer. |
| M2 için yeni telafi mekaniği ekle | Mevcut koruma zaten var; ikincisi ekonomiye yeni kaynak açardı ve "kaybettikçe kazan" hissi riski (E4) doğardı. |

## Araştırma dayanağı

- **TR-1, TR-3** (algılanan adalet): oran ilan edilince güven artar; gizli ayar
  öğrenildiğinde güven çöker.
- **M2 uyarısı** ("küçük + görünür + limitli"): mevcut koruma en fazla +5 puan,
  yani zaten küçük ve limitli. Eksik olan tek şey görünürlüktü.
- **E4 sınırı**: telafi büyütülmedi — oyuncunun "kaybetmek kârlı" sonucuna varması
  engellendi.

## Teknik etki

- `gambling.ts` hesap yolu değişmedi; yalnızca fonksiyonun tanım yeri taşındı.
  Davranış birebir aynı (test bunu doğrular).
- Sıcak yol maliyeti: kumar başına bir detached Redis `MULTI` (5 `HINCRBY` + `EXPIRE`).
  Kumar hunt kadar sık değil, ihmal edilebilir.
- Redis erişilemezse sayaç sessizce atlanır; kumar akışı etkilenmez.

## Tasarım etkisi

- Oyuncu artık "şanssız gün" hissini rakamla test edebilir (autonomy).
- Kötü şans koruması görünür olunca ceza değil **destek** olarak okunur.
- Zenginlik cezasının açıklanması "neden kaybediyorum" sorusuna dürüst cevap verir.

## Uzun vadeli etki

Balance değişirse `w kumar` ve `w yardim drop` ekranları otomatik güncellenir;
elle yazılmış oran metni bırakılmadı. Bu, "yanlış oran ilan etmek" riskini
yapısal olarak ortadan kaldırır.

## Karar

**Uygulandı.** DECISION-002 hâlâ geçerli bir öneri olarak açık kalıyor: gizli
rubber-band uzun vadede kaldırılabilir. Ancak artık gizli değil — ilan edildiği
için `no-hidden-mechanics` ihlali giderildi.

## Gerekçe

Şeffaflık, mekaniği kaldırmadan da kuralı karşılar. Kaldırma daha büyük bir denge
değişikliğidir ve kullanıcı kapsamı dışındadır. Görünür kılmak düşük riskli,
geri alınabilir ve oyuncu güvenine doğrudan katkı sağlar.
