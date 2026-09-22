# OwlHunt — Engagement & Uzun Vadeli Keyif Uygulama Listesi

> **Bağlam:** Bu dosya, `[player-engagement-motivation-review.md](player-engagement-motivation-review.md)` raporunun **OwlHunt’a özel uygulama kataloğu**dur. Rapor teorik + kanıtlı; bu dosya somut + önceliklendirilmiş.
>
> **Uyarı:** Bu bir **teklif listesi**dir. Buradaki hiçbir madde onay olmadan uygulanmaz. Her kalem başlı başına bir “implement” isteği bekler. Kod yok, plan var.
>
> **Kapsam sınırı:** RTP manipülasyonu / addiction-maximizing feature yok. Her öneri E1–E3 aralığında; E4 riskli olanlar açıkça “yapma” olarak işaretli.



## 0. Nasıl okunmalı

Her madde şu 6 alanı içerir:


| Alan             | Anlam                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------- |
| **Kod**          | Kısa referans (A1, B4 vb.)                                                                |
| **Prensip**      | Raporun 3. bölümünden gelen prensip kodu + E-sınıflandırma                                |
| **OwlHunt hook** | Hangi command / system / config dosyasına dokunur                                         |
| **Efor**         | **S** = saatler · **M** = 1–3 gün · **L** = 1+ hafta                                      |
| **Öncelik**      | **P0** = quick win · **P1** = yakın vade · **P2** = orta · **P3** = uzun vade / opsiyonel |
| **Dikkat**       | Kötü uygulanırsa ne olur (kısa)                                                           |


**Sınıflandırma hatırlatması (rapordan):**

- **E1** intrinsic motivasyonu güçlendirir
- **E2** sağlıklı gönüllü geri dönüş ritmi
- **E3** dikkatsizce yapılırsa extrinsic baskıya kayar
- **E4** kumar/FOMO sınırına yaklaşır → **yapılmaz**
- **E5** kanıt henüz ince, deneysel dene

**Prensip kodları (rapor §3):** AN (autonomy), CO (competence), RE (relatedness), FL (flow), GO (goal-setting), RW (reward), CU (curiosity), MA (mastery), NO (novelty), LT (long-term), RT (retention), TR (transparency).

---



## 1. Quick-wins (P0 · 1 hafta içinde bitirilebilir)

### A2 · Milestone yaklaşım göstergesi (soft-teaser)

- **Prensip:** GO-1, CU-1 · E1
- **Ne:** Zaten milestone `Av serisi 7/25` gösteriyor; **son 3 av** için `Av serisi 22/25 · yakında ödül` gibi bir görsel vurgu. Curiosity + anticipation.
- **Hook:** `src/systems/hunt-milestones.ts`, `src/utils/hunt-ux.ts`
- **Efor:** S
- **Dikkat:** Her seferinde büyük vurgu yaparsan gürültü olur. Sadece son N’de highlight.



### A3 · Cooldown mesajını “anlamlı” yap

- **Prensip:** FL-4, CO-1 · E1
- **Ne:** Şu an cooldown mesajı sadece “X sn bekle”. Onun yerine bir sonraki hunt’ta oyuncunun ne yapabileceğine kısa ipucu (bir sonraki milestone, günlük questin durumu, prey-dex’te eksik türü). Kısa, tek satır. Zaten auto-delete var.
- **Hook:** `src/utils/guarded-discord.ts` (`replyWithSuppression`), cooldown key `cooldown:hunt:`*
- **Efor:** S/M
- **Dikkat:** Oyuncu spam yaparken zaten sıkkın; bilgi kısa/faydalı olmalı, motive edici sos değil. Yoksa E3 kaymaya başlar.



### A4 · Drop oranı şeffaflığı (algılanan adalet)

- **Prensip:** TR-1, TR-3 · E1
- **Ne:** `/owl help hunt` veya `/owl katalog` içinde her prey türü için görüntülenebilir **drop tablosu** (yaklaşık olsalar bile). Kullanıcı şikayeti “10 elde 1 kere bile kazanamadım” — çoğu zaman **algı** problemidir; oran ilan edilirse güven artar.
- **Hook:** `src/commands/owl-katalog.ts`, `src/commands/owl-help.ts`, `src/systems/drops.ts`
- **Efor:** M
- **Dikkat:** Oran değişecekse önceden duyur. Yalanla oran vermek en kötü senaryodur.



### A5 · Daily quest listesi kotası

- **Prensip:** GO-2 · E1 (raporun quest-fatigue uyarısı)
- **Ne:** Aynı anda aktif quest sayısını ~3–5 ile sınırla (zaten öyle olabilir; teyit + görünür yap). Fazla sayıda quest liste tükenmesi hissi ve extrinsic kayma yaratır.
- **Hook:** `src/systems/daily-quests.ts`, `src/config/daily-quest-pool.ts`
- **Efor:** S
- **Dikkat:** Çok azaltırsan oyuncuya “yapacak bir şey yok” hissi verir. Sweet spot 3–5.



### A6 · Ölçek anlamlılığı: sayı büyürken **birim** ekle

- **Prensip:** CO-4 · E1
- **Ne:** XP/coin/level büyüdükçe çıplak sayı okumaz olur. Milestone/prestige seviyelerinde “Level 42 · Guardian rank” gibi **kategori etiketi** ekle. Competence görünür kalır.
- **Hook:** `src/commands/owl-stats.ts`, `src/commands/owl-owl.ts`, `src/systems/prestige`
- **Efor:** S
- **Dikkat:** Kategori sayısı çok fazla olursa etkisi kaybolur; ~5–8 tier ideal.



### A7 · “Welcome-back” pack (grace-friendly return)

- **Prensip:** RT-3, RT-4 · E2
- **Ne:** N gün ara veren oyuncu geri döndüğünde tek seferlik küçük hediye (streak’i kırdığı için ceza değil, döndüğü için karşılama). Frommel & Mandryk 2022’nin “kaçırma cezasını azaltma” önerisiyle uyumlu.
- **Hook:** `src/systems/daily-login.ts`, yeni redis key `welcomeback:{userId}`
- **Efor:** M
- **Dikkat:** Cömert değil, **karşılayıcı** olsun. Login farming teşviki olmasın (aynı oyuncu 3 gün ara → 3 pack sömürmesin; ay içinde en fazla 1).



### A8 · “Bir sonraki hedef” hızlı komutu

- **Prensip:** GO-1, RT-1 · E1
- **Ne:** `/owl next` (veya mevcut bir komuta panel): oyuncuya **şimdi ne yapması** en anlamlı, kısaca söyle: “milestone’a 3 av”, “quest X yakın”, “günlük login almaya 1 saat”. Autonomy destekli.
- **Hook:** yeni komut `owl-next.ts` veya `owl-owl.ts` altında bir panel
- **Efor:** M
- **Dikkat:** Bir “must-do listesi” gibi görünürse E3’e kayar. **Öneri** dilinde tut (“istersen”), zorunluluk değil.

---



## 2. Hunt loop (çekirdek keyfi büyüt)



### B1 · Hunt varyasyonu: micro-events

- **Prensip:** NO-1, NO-2, CU-1 · E1
- **Ne:** Her X huntta bir “özel encounter” (nadir düşman, gizli olay, çevresel puzzle). Ana loop’u değiştirmeden novelty enjekte eder.
- **Hook:** `src/systems/hunt.ts`, `src/systems/encounter-fight.ts`
- **Efor:** L
- **Dikkat:** Frekans doğru olmalı; çok sıksa “özel” değil, çok seyrekse fark edilmez. Analytics ile kalibre et.



### B2 · Biome / bölge seçimi (autonomy + novelty)

- **Prensip:** AN-2, NO-2 · E1
- **Ne:** Hunt tek bölgede (DEFAULT_HUNT_BIOME_ID = b0). Level açıldıkça yeni biome açılır: farklı prey tablosu, farklı görsel. Autonomy + novelty aynı anda.
- **Hook:** `src/systems/hunt.ts` (biome id parametresi zaten var, sadece pasif); `src/config.ts`
- **Efor:** L (içerik ağırlıklı)
- **Dikkat:** Biome’lar arasında güçlü meta olursa autonomy sahte olur. Her biome kendi build’ini teşvik etmeli.



### B3 · Hunt streak’i (session-level, günlük değil)

- **Prensip:** MA-2, FL-1 · E1
- **Ne:** Ard arda başarılı hunt için mikro-buff (ör. 5 arka arkaya = %10 XP + kısa süreli). Session içinde flow’u besler; günlük login streak’inden farklı, cezasız.
- **Hook:** `src/systems/hunt.ts` in-memory redis session
- **Efor:** M
- **Dikkat:** Streak kırılırsa cezasız — sadece “bonus vardı, artık yok”. FOMO’ya kaymasın.



### B4 · Tame / encounter derinliği (mastery katmanı)

- **Prensip:** MA-1, MA-4 · E1
- **Ne:** Encounter’da 2–3 farklı taktik seçilebilir (already Tame system var). Zamanla öğrenilen prey-specific pattern (bu prey X’ten korkar) → mastery.
- **Hook:** `src/utils/tame-narrative.ts`, `src/systems/tame-session.ts`
- **Efor:** M
- **Dikkat:** Sabit dominant strateji oluşursa autonomy sahte. Prey-based counter’lar farklı olmalı.



### B5 · Prey-dex progress bar

- **Prensip:** CU-1, MA-4, GO-3 · E1
- **Ne:** `/owl katalog` içinde “bulduğun/toplam” + eksik prey’lere yönlendiren hint. Curiosity engine.
- **Hook:** `src/commands/owl-katalog.ts`, `src/systems/prey-dex.ts`
- **Efor:** M
- **Dikkat:** %100 collection çok kolay olmasın (curiosity ölür); imkansız da olmasın (bunaltı).

---



## 3. Progression & mastery (upgrade / evrim / prestige)



### C1 · Level-up’ta “functional unlock”

- **Prensip:** CO-3, MA-1, LT-4 · E1
- **Ne:** Belirli seviyelerde **yeni mekanik** açılsın (biome, quest tier, guild feature) — sadece sayı büyümesi değil. Rapor: “power creep without mastery = sahte competence”.
- **Hook:** `src/commands/owl-upgrade.ts`, `src/commands/owl-evrim.ts`, `src/systems/hunt-milestones.ts`
- **Efor:** M/L
- **Dikkat:** Unlock haritası önceden bilinsin (roadmap); sürprizlerin çoğu iyi ama tamamı sürpriz olursa oyuncu **hedef göremez**.



### C2 · Evrim (evolution) sürecini görselleştir

- **Prensip:** CO-1, CU-1, LT-3 · E1
- **Ne:** Evrim aşamaları “ilerleme çubuğu + son adım büyük etkinlik” olarak sahnelensin. Long-term progression’ın büyük fanfare’i eksikse motivasyon zayıflar.
- **Hook:** `src/systems/owl-moon-evolution.ts`, `src/config/owl-evolution-emoji-ids.ts`
- **Efor:** M
- **Dikkat:** Fanfare abartılırsa yenilenir yenilenir tekrar hissini kaybeder; kritik anlar için sakla.



### C3 · Prestige sonrası “meta-progression yolu”

- **Prensip:** LT-2, MA-3 · E1
- **Ne:** Prestige resetleyen oyuncu için **kalıcı** bir katman (perma unlock, cosmetic, rank). Rogue-lite meta-progression modeli. Reset “kayıp” değil, “ilerleme” olmalı.
- **Hook:** `src/commands/owl-prestige.ts`
- **Efor:** L
- **Dikkat:** Kalıcı katman çok güçlü olursa reset zorunluluğuna dönüşür (E3). Kalıcı tarafı yavaş büyüsün.



### C4 · Skill tree / build kararı

- **Prensip:** AN-1, MA-4 · E1
- **Ne:** Level ilerlerken oyuncuya seçim: “ranger tree, tamer tree, trader tree” gibi anlamlı ayrık build. Autonomy + competence birlikte.
- **Hook:** yeni sistem `src/systems/skill-tree.ts`
- **Efor:** L
- **Dikkat:** Dominant strateji olmasın (playtest gerekli). Reset opsiyonu (paylı) olsun, autonomy korunsun.



### C5 · Milestone XP eğrisi kontrolü

- **Prensip:** RW-2, E3 uyarı · **E1 → E3 sınırı**
- **Ne:** Hunt milestone XP’si (base 80 + tier*40) hunt XP’nin **yerini almasın**. Milestone ödülü, hunt keyfini gölgelerse extrinsic kayma (Deci 1999 undermining). Denge: milestone ödülü baz hunt XP’sinin ~1–2 katı, daha büyük değil.
- **Hook:** `src/config/hunt-milestones.ts`
- **Efor:** S (parametre)
- **Dikkat:** Ölçüm gerekli — “oyuncu milestone için mi hunt yapıyor, keyif için mi?” anket / davranış analitiği ile bak.

---



## 4. Rewards & variability (drops / lootbox / RNG)



### D1 · Cömert base + nadir spike

- **Prensip:** RW-1 · E1
- **Ne:** Her hunt küçük bir tatmin (garanti drop veya XP), nadiren büyük sürpriz. Şu andaki dağılım için ölçüm sonrası kalibre et.
- **Hook:** `src/systems/drops.ts`, `src/systems/lootbox.ts`
- **Efor:** M
- **Dikkat:** Base çok cömertse spike’lar fark edilmez; base çok cimriyse frustration.



### D2 · Şeffaf pity mekanizması

- **Prensip:** RW-3, TR-1 · E1 (uygulanan gacha oyunlarında “hard pity” standart)
- **Ne:** “20 nadir drop denemesinden sonra garanti” gibi görünür bir sistem. Bad-luck koruması + iletişim = algılanan adalet.
- **Hook:** `src/systems/drops.ts` + kullanıcı görüntüsü `/owl stats` altında
- **Efor:** M
- **Dikkat:** Pity **yalan** olursa güven biter. Görünür sayaç şart.



### D3 · Kozmetik / non-power reward katmanı

- **Prensip:** RW-4 (pozitif tarafı), NO-3 · E1
- **Ne:** Sadece güç değil, kozmetik ödüller (baykuş renk varyantı, unvanlar, guild emblem). Novelty + competence gösterimi + power creep’siz.
- **Hook:** `src/config/custom-emojis.ts`, yeni cosmetics katmanı
- **Efor:** L
- **Dikkat:** Kozmetiği pay-only yapmak dark pattern sınırıdır. Oyun-içi kazanılabilir olsun.



### D4 · Drop hikaye anlatısı

- **Prensip:** RW-2 (mastery loop üstü), CU-2 · E1
- **Ne:** Nadir bir drop düştüğünde küçük bir “lore/başarı” satırı: “Bu ilk kez bir Guardian Owl için kayıt edildi”. Ödülü **hikayeye** eklemler.
- **Hook:** `src/utils/hunt-ux.ts`, `src/systems/prey-dex.ts`
- **Efor:** M
- **Dikkat:** Her drop’a hikaye eklersen tekdüzeleşir. Nadir + kişisel “first time” hisleri için sakla.



### D5 · Loot box gerçek para karışmayacak

- **Prensip:** RW-4 · **E4 → yapma**
- **Ne:** Loot box zaten oyun-içi. Bu böyle kalsın. Gerçek para ile RNG ödül **sınırın diğer tarafıdır**.
- **Hook:** `src/systems/lootbox.ts` (mevcut şeffaflığı koru)
- **Efor:** — (koruma maddesi)
- **Dikkat:** Ekonomi baskısıyla “premium coin” önerileri gelirse hep bu sınırı hatırla.

---



## 5. Goals & quests (proximal + distal katman)



### E1 · Görev katman modeli: günlük · haftalık · sezonluk

- **Prensip:** GO-1, LT-1 · E1
- **Ne:** Şu an daily-quests var. Üzerine **haftalık** (5–7 gün ölçeğinde) ve **sezonluk** (aylık) katman. Katmanlı goal hierarchy = sürekli “şimdi ne yapacağım” cevabı.
- **Hook:** `src/systems/daily-quests.ts`, yeni `src/systems/weekly-quests.ts`, yeni `src/systems/seasonal.ts`
- **Efor:** L
- **Dikkat:** Katman fazlaysa quest fatigue (Frommel & Mandryk 2022 dark side). Aktif quest limitini üst katmanlarla da denetle.



### E2 · Quest anlamı: unlock/ilerleme bağla

- **Prensip:** GO-3 · E1
- **Ne:** Her quest yalnız XP/coin değil, **oyun içi bir şey açsın** (yeni npc diyaloğu, prey-dex sayfası, mini-cosmetic).
- **Hook:** `src/systems/quest-tracker.ts`, `src/config/daily-quest-pool.ts`
- **Efor:** M/L
- **Dikkat:** Unlock zinciri kırılırsa geri gelen oyuncu “kaçırdım” hisseder → E4 sınırına dokun. Kalıcı unlock olarak tasarla.



### E3 · Quest ~“kendi seç”

- **Prensip:** AN-2, GO-4 · E1
- **Ne:** Bugünkü 3 quest önerisi arasından oyuncu **2’sini seçsin**. Autonomy destekli goal-setting.
- **Hook:** `src/systems/daily-quests.ts`
- **Efor:** M
- **Dikkat:** Seçim yalnızca kozmetik olursa sahte autonomy. Gerçek trade-off olsun (kolay hızlı XP vs zor büyük ödül).



### E4 · “Bugünkü hedef” tek satır

- **Prensip:** GO-1 · E1
- **Ne:** Her `/owl` çağrısında paneli/embed’in başında oyuncunun **bugün için 1 net hedef**i satırı (kendi seçtiği ya da sistemin en yakın önerdiği). Locke & Latham’ın proximal goal etkisi.
- **Hook:** `src/commands/owl-owl.ts`, `src/utils/hunt-ux.ts`
- **Efor:** S
- **Dikkat:** “Zorunluluk” dilinden kaç (“Şunu yapmalısın” değil, “önerin: ...”).

---



## 6. Trade & market (autonomy + relatedness + adalet)



### F1 · Trade log / geçmiş

- **Prensip:** TR-2, RE-1 · E1
- **Ne:** Oyuncuya kendi trade geçmişi görünür (kim, ne, ne zaman). Ekonomik adalet algısı + güven.
- **Hook:** `src/commands/owl-trade.ts`, `src/systems/trade.ts`, `src/systems/market.ts`
- **Efor:** M
- **Dikkat:** Geçmiş çok geniş görünürse gizlilik/kötüye kullanım. Sadece oyuncunun kendisi görsün.



### F2 · Market fiyat sinyali (soft)

- **Prensip:** CO-4, TR-1 · E1
- **Ne:** İtemin “tarihsel ortalama fiyat aralığı” göster. Yeni oyuncu kandırılmasın (adalet). Autonomy + informed decision.
- **Hook:** `src/systems/market.ts`, `/owl market` UI
- **Efor:** M
- **Dikkat:** Fiyat kilidi olma → oyuncular fiyat belirleme özgürlüğü. Sadece sinyal.



### F3 · Trade hediye modu

- **Prensip:** RE-1 · E1
- **Ne:** “Hiçbir şey karşılığında hediye et” akışı (guild üyesine, arkadaşa). Cole & Griffiths 2007: sosyal bağ oynama keyfinin büyük bir bileşeni.
- **Hook:** `src/commands/owl-trade.ts`, `src/systems/trade.ts`
- **Efor:** M
- **Dikkat:** Hediye ile main-account beslenmesi ekonomiyi bozar. Limit + antichat/anticheat işaretleri.



### F4 · Guild ticaret bonus’u

- **Prensip:** RE-3 · E1
- **Ne:** Aynı guild içi trade’de küçük vergi azalması / bonus. Guild relatedness güçlenir.
- **Hook:** `src/systems/guild-lifecycle.ts`, `src/systems/trade.ts`
- **Efor:** M
- **Dikkat:** Vergi farkı çok büyükse solo oyuncu dışlanır. Fark küçük tut.

---



## 7. Guild & sosyal relatedness



### G1 · Guild kolektif hedefi

- **Prensip:** RE-3, GO-1 · E1
- **Ne:** Haftalık guild-wide hedef (birlikte X hunt, Y drop, Z trade). Ortak fanfare. Cole & Griffiths’in en güçlü retention faktörü.
- **Hook:** `src/systems/guild-lifecycle.ts` + yeni `src/systems/guild-goals.ts`
- **Efor:** L
- **Dikkat:** Aktif olmayan guild üyesi dışlanmasın; kotalar bireyi değil, guild’i ölçsün.



### G2 · Guild sohbet ritüelleri

- **Prensip:** RE-2 · E1
- **Ne:** “Rock and Stone” tarzı guild-selam emote / short-message ritüel. Discord bot bağlamında güçlü.
- **Hook:** `src/systems/guild-lifecycle.ts`, `src/config/custom-emojis.ts`
- **Efor:** S
- **Dikkat:** Zorunlu değil; sadece opt-in.



### G3 · Pozitif tanınma sistemi (kudos)

- **Prensip:** RE-2, RE-3 · E1
- **Ne:** Haftada 1 “teşekkür/kudos” gönder — sayılabilir güvenli statü sinyali (WoW’un kompliman sistemi mantığı).
- **Hook:** yeni `src/systems/kudos.ts`
- **Efor:** M
- **Dikkat:** Vote-farming olmasın; oyun-içi ödül bağlamayın (extrinsic bozar).



### G4 · Toksisite raporu ilerlemesi

- **Prensip:** RE-4 (relatedness koruması) · E1
- **Ne:** Şu anki moderation üzerine, oyuncu görebileceği rapor sonucu (“raporun incelendi”). Sosyal alan güvenli hissi.
- **Hook:** `src/systems/moderation.ts`, `src/commands/appeal.ts`
- **Efor:** M
- **Dikkat:** Yanlış raporlar için de fair process gösterilmeli.



### G5 · Novice / mentor bağı (opsiyonel)

- **Prensip:** RE-1, RE-4, CO-3 · E1
- **Ne:** Yeni oyuncu ↔ deneyimli oyuncu asenkron eşleşme (FFXIV Novice Network mantığı). İlk 7 gün mentorluk küçük ödül.
- **Hook:** `src/systems/onboarding.ts`, yeni `src/systems/mentor.ts`
- **Efor:** L
- **Dikkat:** Ödül farming’i (mentor sadece ödül için mentorluk yapar) — küçük ödül + kalite metrikleri.

---



## 8. Onboarding & newbie retention



### H1 · İlk 30 dakika “happy path”

- **Prensip:** CO-3, FL-1, GO-1 · E1
- **Ne:** İlk hunt → ilk drop → ilk quest tamamlanması → ilk milestone — hepsi hızlı ardışık gelmeli. Yeni oyuncunun ilk oturumu iyi biterse retention katlanır.
- **Hook:** `src/systems/onboarding.ts`, `src/systems/newbie-boost.ts`
- **Efor:** M
- **Dikkat:** Happy path bittiğinde “çöl” gelmesin — 30 dk sonrası da açık yolu olmalı.



### H2 · Onboarding merakı: mystery

- **Prensip:** CU-1, CU-4 · E1
- **Ne:** İlk oturumda görülen bir “kilit” item veya npc → “sonra açılacak” — anticipation.
- **Hook:** `src/systems/onboarding.ts`
- **Efor:** M
- **Dikkat:** Teaser cevaplanmalı — 20 saat sonra bile hala kilitse hayal kırıklığı.



### H3 · Yeni oyuncu buddy-boost

- **Prensip:** RE-1, CO-3 · E1
- **Ne:** Yeni oyuncu ilk 3 hunt’ı bir “rehber baykuş npc” ile birlikte yapıyor gibi (küçük dialog + hint). Yalnız oyuncu için de relatedness (sanal).
- **Hook:** `src/systems/onboarding.ts`, `src/utils/tame-narrative.ts`
- **Efor:** M
- **Dikkat:** NPC dialog’ları uzun/zorlayıcı olmasın; skip’lenebilir.



### H4 · İlk gün cezası **yok**

- **Prensip:** RT-2, RT-3 · E2
- **Ne:** Streak/timer/quest cezaları yeni oyuncunun ilk 7 gününde uygulanmasın veya çok yumuşak olsun. Baskı = hızlı churn.
- **Hook:** `src/systems/newbie-boost.ts`, `src/systems/daily-quests.ts`
- **Efor:** S
- **Dikkat:** Sömürüye açık tarafı: alt-account farming. Rate-limit ile kontrol.

---



## 9. Daily / streak / return (grace-friendly)



### I1 · Daily reward: hediye dili

- **Prensip:** RT-5 (Frommel & Mandryk 2022) · E2
- **Ne:** Daily reward mesajı “kaybetme” dili yerine “sunuldu” dili. “+5 login streak” yerine “bugünkü hediye”. Kelime seçimi extrinsic → intrinsic geçişini destekler.
- **Hook:** `src/systems/daily-login.ts`, ui-text
- **Efor:** S
- **Dikkat:** Streak’i tamamen kaldırma önerilmiyor; oyuncular streak’i seviyor. Sadece **görsel baskıyı** yumuşat.



### I2 · Weekly quest reset “taze başlangıç” vurgusu

- **Prensip:** RT-1, LT-2 · E2
- **Ne:** Haftalık reset gününde küçük bir “yeni hafta, yeni fırsat” mesajı. Ceza değil, ritüel.
- **Hook:** yeni `src/systems/weekly-quests.ts` (E1 madde 1)
- **Efor:** S
- **Dikkat:** Her hafta aynı mesaj tekdüzeleşir; varyant havuzu olsun.



### I3 · “Sessiz” streak zaten var — koru + göster

- **Prensip:** RT-2, RT-3 · E2
- **Ne:** Hunt milestone silent reset kararı doğru. Bunu **görünür bir güven mesajı** olarak da ileten kısa yer (help sayfası): “Ara verebilirsin, seri yumuşak kırılır”. Politika iletişimi güveni artırır.
- **Hook:** `src/commands/owl-help.ts`
- **Efor:** S
- **Dikkat:** Aşırı vurgu yapıp “seriyi ciddiye alma” demek de olmasın — dengede tut.



### I4 · Daily cap yerine daily softening

- **Prensip:** RT-2, AN-3 · E1
- **Ne:** Belirli aktiviteler için hard-cap yerine, cap üstü aktivitede ödül azaltarak devam etme. “Bu yeter” değil, “bugün için doyum noktası oldu”. Autonomy korunur.
- **Hook:** günlük XP hesaplamaları (hunt/xp sistemi)
- **Efor:** M
- **Dikkat:** Softening çok yumuşaksa cap fonksiyonunu yerine getirmez; çok sertse hard-cap gibi hisseder. Test gerekli.

---



## 10. Events / seasonal / liveops



### J1 · Aylık tema event

- **Prensip:** NO-2, LT-2, RT-1 · E2
- **Ne:** Her ay farklı tema (özel prey, farklı drop tablosu, event quest). Novelty + long-term ritim.
- **Hook:** `src/systems/liveops-cadence.ts`
- **Efor:** L (içerik döngüsü)
- **Dikkat:** Event ödülleri **FOMO-lu** olmasın (E4 sınırı). Katıl-katılma seçimi, kaçırılan event geri gelebilir (yıllık rotasyon).



### J2 · Event içi micro-goals

- **Prensip:** GO-1, RT-1 · E1
- **Ne:** Event içinde 3–5 kolay-orta hedef (hepsi tamamlanmasa da OK). Dopamin small-wins.
- **Hook:** J1 ile birlikte
- **Efor:** M (event başına)
- **Dikkat:** Event fatigue; her ay büyük değil, orta ay/aylık küçük dönüşüm.



### J3 · Event teaser sistemi

- **Prensip:** CU-1, RT-1 · E1
- **Ne:** Event başlamadan 3–5 gün önce ipucu/countdown. Anticipation = keyfin büyük parçası.
- **Hook:** `src/systems/liveops-cadence.ts`, announcement channel
- **Efor:** S
- **Dikkat:** Fake teaser (“büyük şey!”) ama küçük event = güven yıkılır.

---



## 11. Curiosity & discovery



### K1 · Prey-dex hint & mystery entries

- **Prensip:** CU-1, MA-4 · E1
- **Ne:** Katalog’da bulunmamış prey için “????” + kısmi ipucu. Loewenstein’ın information-gap.
- **Hook:** `src/commands/owl-katalog.ts`, `src/systems/prey-dex.ts`
- **Efor:** M
- **Dikkat:** İpucu **çözülebilir** olsun; imkansızsa curiosity ölür.



### K2 · Lore parçaları drop

- **Prensip:** CU-2, CU-4 · E1
- **Ne:** Nadir dropla birlikte kısa lore satırı (baykuş türünün geçmişi, dünya notu). Environmental storytelling.
- **Hook:** `src/systems/drops.ts`, `src/utils/hunt-ux.ts`
- **Efor:** M (yazım + tetik)
- **Dikkat:** Yorucu lore blokları değil, 1–2 satır aroma.



### K3 · “Gizli” komut / mekanik

- **Prensip:** CU-1 · E1
- **Ne:** Belli koşullarda tetiklenen bir gizli mini-event (ör. bir günü prey-dex’i tamamlayan oyuncuya özel encounter). Discovery haber olsun.
- **Hook:** yeni event tetikleyici
- **Efor:** M
- **Dikkat:** Gizli özel olmalı — spoiler kültüründe çabuk yayılır, sürekli yenile.



### K4 · Community wiki teşviki

- **Prensip:** RE-3, CU-2 · E1
- **Ne:** Oyuncuların prey/build/quest tips paylaşacağı guild veya web alanı. Cole & Griffiths’in “oyun dışında sosyal”.
- **Hook:** Discord kanal önerisi + owl-help referansı
- **Efor:** S
- **Dikkat:** Yanlış bilgi yayılmasın; mod/topluluk denetimi.

---



## 12. UX / feedback / flow



### L1 · Response time budget

- **Prensip:** FL-1, FL-4 · E1
- **Ne:** `/owl hunt` gibi hot komutlarda p95 ≤ 500 ms tut. GameFlow’un “instant feedback” ilkesi.
- **Hook:** metric + performance sprint
- **Efor:** M (kısmen zaten var)
- **Dikkat:** Yavaş komut çekirdek loop’u kırar.



### L2 · Cooldown mesajları auto-delete (zaten yapıldı)

- **Prensip:** FL-4 · E1
- **Ne:** Bu tamamlandı (COOLDOWN_NOTICE_AUTO_DELETE_MS). Değişiklik yok. Kanal spam önleme.
- **Hook:** `src/config.ts`, `src/utils/guarded-discord.ts`
- **Efor:** — (tamamlandı)
- **Dikkat:** Süre çok kısa olursa oyuncu bilgiyi göremez (8 s doğru bölge).



### L3 · Emoji + ses değil ama görsel “başarı” anları

- **Prensip:** CO-1 · E1
- **Ne:** Nadir başarılar için özel emoji/embed rengi. Metnin dışında görsel sinyal.
- **Hook:** `src/config/custom-emojis.ts`, çeşitli ux dosyaları
- **Efor:** S
- **Dikkat:** Her başarıya özel görsel → “özel” hissi kaybolur. Nadir + gerçekten büyük anlar için.



### L4 · Error mesajlarının dili

- **Prensip:** CO-1, TR-2 · E1
- **Ne:** Hata mesajı “X yapılamadı çünkü Y” — oyuncunun kendini aptal hissetmesin. Adalet algısı.
- **Hook:** `src/utils/command-error.ts` genel review
- **Efor:** S
- **Dikkat:** Aşırı detaylı hata mesajı internal bilgi sızdırır. Kullanıcı + log ayrımı.



### L5 · Yardım keşif kolaylığı

- **Prensip:** AN-3, CU-4 · E1
- **Ne:** `/owl help` başlangıçta “merak edeceğin şu 5 şey” önerisi. Yeni oyuncu kaybolmasın.
- **Hook:** `src/commands/owl-help.ts`
- **Efor:** S
- **Dikkat:** Yönlendirici olsun; dayatıcı olmasın.

---



## 13. Gambling (algılanan adalet + sınırın çizgisi)



### M1 · Coinflip/BJ/duelbet için görünür istatistik

- **Prensip:** TR-1, TR-3 · E1
- **Ne:** Oyuncuya kendi win/loss oranını göster (opsiyonel). Şeffaflık = güven. Sistem RTP’si zaten adilse rakam gösterme sistemi haklı çıkarır.
- **Hook:** `src/systems/gamble/`, `src/systems/gambling.ts`, komut UI
- **Efor:** M
- **Dikkat:** Bazı oyuncular “şanssız gün” miti ile huzursuz olabilir; opsiyonel yap.



### M2 · Session-level “bad-luck relief”

- **Prensip:** RW-3, TR-1 · E1
- **Ne:** Kısa aralıkta çok kayıp seride küçük bir “bakiye koruma” eventi (kayıp oyunun bir bölümü telafi). Kumar dinamiğini değil, oyuncu ilişkisini besler.
- **Hook:** `src/systems/gambling.ts`
- **Efor:** M
- **Dikkat:** İnce çizgi: telafi çok büyükse oyuncu kaybettikçe kazanç hisseder (E4). Küçük + görünür + limitli olsun.



### M3 · Daily bet cap

- **Prensip:** RT-2 · E2 (koruyucu)
- **Ne:** Günlük toplam bahis miktarına opsiyonel oyuncu-tarafı limit (kendi ayarladığı). Autonomy + iyi oluş.
- **Hook:** `src/systems/gamble/validate-bet.ts`
- **Efor:** M
- **Dikkat:** Opsiyonel olmalı, zorunlu değil. Zorunlu limit AN-1’i bozar.



### M4 · Gerçek para karışmayacak (koruma)

- **Prensip:** RW-4 · **E4 → yapma**
- **Ne:** Kumar mini-oyunlar oyun-içi ekonomiye kalsın; premium currency ile gamble sadece pozitif RTP değilse dark pattern. Bu sınır **çizili kalır**.
- **Hook:** `src/systems/gamble/`
- **Efor:** — (koruma)
- **Dikkat:** Monetization baskısı gelirse kozmetik battle-pass tarzı **ödülsüz** modeller tercih edilmeli.

---



## 14. Anti-boredom / novelty



### N1 · Build çeşitliliği ölçümü

- **Prensip:** NO-1, AN-1 · E5 (deneysel)
- **Ne:** En popüler 3 build’in kullanım oranı %70’i geçmişse **dominant meta** vardır. Balance sprint tetiklensin.
- **Hook:** anonim analytics + `src/systems/prestige` / `src/systems/upgrade`
- **Efor:** M (metrik)
- **Dikkat:** Balance çok sık = fatigue. Ölçüm önce, aksiyon sonra.



### N2 · Küçük mekanik varyasyonlar

- **Prensip:** NO-1, MA-1 · E1
- **Ne:** Aynı hunt farklı hava/zaman/mod (gece hunt daha nadir drop, sabah XP bonus). Basit varyasyon novelty’i besler.
- **Hook:** `src/systems/hunt.ts`
- **Efor:** M
- **Dikkat:** Karmaşıklaşırsa flow’u kırar; basit + kısa açıklamalı.



### N3 · İçerik bekleme kutusu iletişimi

- **Prensip:** RT-1, TR-3 · E1
- **Ne:** Yeni içerik yolu (roadmap) oyuncuya görünür — anticipation. “Şu sezon çalışıyor”, “Yakında X”. Long-term motivasyon.
- **Hook:** discord announcement + `owl-help`
- **Efor:** S
- **Dikkat:** Roadmap kaçırılmışsa güven biter. Kesin taahhüt vermek yerine yönelim.

---



## 15. Transparency & communication



### O1 · RNG dokümanı (statik sayfa)

- **Prensip:** TR-1, TR-3 · E1
- **Ne:** Web/docs sayfasında “oranlar, pity, adil işleyiş” açıklaması. Şeffaflık artı.
- **Hook:** `docs/` altında yeni bir Fair Play sayfası
- **Efor:** S
- **Dikkat:** Sayfa güncel tutulmalı — eskirse ters etki.



### O2 · Balance değişiklik changelog

- **Prensip:** TR-3 · E1
- **Ne:** Her balance/oran değişimi öncesi/sonrası duyuru. “Bilinmeyen nerf” en güven bozucu şey.
- **Hook:** discord kanal + `docs/CHANGELOG-*.md`
- **Efor:** S (süreç)
- **Dikkat:** Küçük değişiklik büyük duyurulmasın (dikkat enflasyonu).



### O3 · “Nasıl çalışıyor” komutları

- **Prensip:** CU-4, TR-1 · E1
- **Ne:** `/owl help mechanics` gibi — level formülü, drop mantığı, milestone kuralları özet. Öğrenmek isteyen oyuncu için.
- **Hook:** `src/commands/owl-help.ts`
- **Efor:** M
- **Dikkat:** Uzun manüel değil, tek satır özet + link.



### O4 · Feedback loop görünürlüğü

- **Prensip:** RE-3, TR-3 · E1
- **Ne:** Feedback survey zaten var. “Geçen ay X öneri yapıldı, Y’si uygulandı” tarzı geri bildirim. Oyuncu duyulduğunu hissetsin.
- **Hook:** `src/systems/feedback-*.ts`, discord kanal
- **Efor:** S (süreç)
- **Dikkat:** Uygulama yoksa yalan olur; hız beklentisi doğru ayarla.

---



## 16. Metrics & measurement (proactive)



### P1 · Session-length ve return-rate

- **Prensip:** RT (all) · E1
- **Ne:** Ortalama oturum süresi, D1/D7/D30 return oranları. Retention gerçekten sağlıklı mı ölçmek şart.
- **Hook:** anonim analytics (Redis counter / event log)
- **Efor:** M
- **Dikkat:** Kişisel veri toplamayın; agregat + anonim.



### P2 · Frustration sinyalleri

- **Prensip:** FL-1, TR-1 · E1
- **Ne:** “Ard arda cooldown mesajı”, “ard arda başarısız gamble”, “ard arda hata” sinyalleri agregat ölçülsün. Frustration hotspot’ları tespit.
- **Hook:** `src/utils/guarded-discord.ts` + event log
- **Efor:** M
- **Dikkat:** Bu ölçüm oyuncuyu **manipüle etmek** için değil; sadece “oyun kimlere kötü hissettiriyor” bulgusu.



### P3 · Aktif quest completion oranı

- **Prensip:** GO-2 · E1
- **Ne:** Daily quest completion rate <%40 ise fatigue işareti; >%90 ise çok kolay. 60–80 sağlıklı.
- **Hook:** `src/systems/quest-tracker.ts`
- **Efor:** M
- **Dikkat:** Segmentli (yeni vs eski oyuncu) bak — ortalama yanıltıcı.



### P4 · Milestone claim istatistiği (yeni)

- **Prensip:** RW-2, RW-3 · E1
- **Ne:** Yeni hunt-milestone sistemi ne kadar oyuncuya, hangi tier’da? Sıkıntı: “ödül peşinde koştuğu için hunt yapıyor mu?” — büyük ödül tetiklerse E3 sinyali.
- **Hook:** `src/systems/hunt-milestones.ts`
- **Efor:** S
- **Dikkat:** İlk 2–4 hafta verisiyle C5 (milestone XP eğrisi) kararı alınsın.



### P5 · Basit kısa anket sistemi

- **Prensip:** RE-3, O4 ile bağlı · E1
- **Ne:** Feedback-survey ile ayda 1 kısa mikroanket (3 soru). Enjoyment, frustration, next-feature.
- **Hook:** `src/systems/feedback-survey.ts`
- **Efor:** S (zaten var, ritmi düzenle)
- **Dikkat:** Anket yorgunluğu; kısa + opsiyonel + hediyesiz (extrinsic kaçınma).

---



## 17. Yapma listesi (E4 sınırı — asla)

Bunlar rapor + best-practice literatürünün açıkça “dark pattern” dediği şeyler; OwlHunt’ta uygulanmamalı, önerilirse geri çevrilmeli.


| #   | Yapma                                        | Neden                                                 |
| --- | -------------------------------------------- | ----------------------------------------------------- |
| X1  | Gerçek para ile RNG loot box                 | Kumar dinamiği; loot box zararı literatürü            |
| X2  | Streak kırılınca büyük görsel utandırma      | Introjected regulation (Frommel & Mandryk 2022)       |
| X3  | “Sadece bugün” fake urgency timer            | Dark pattern; güven yıkımı                            |
| X4  | Rakip zayıflatan gizli DDA (rubber-band)     | Rekabette adalet algısı yıkılır (DDA meta-analizleri) |
| X5  | Alt-account/pay teşvikli login farming       | Ekonomi + fair play zararı                            |
| X6  | “Bilerek kazandır” kumar hook                | Kısa vadeli hook, uzun vadeli terk                    |
| X7  | Uzun cutscene / modal / kesintili UX         | Flow kırılır (GameFlow FL-4)                          |
| X8  | Zorunlu grup içerik (yalnız oyuncu dışlanır) | Relatedness sahte olur                                |
| X9  | Overload quest listesi (10+ eş zamanlı)      | Quest fatigue                                         |
| X10 | Kozmetiği yalnızca ödemeli yapma             | Motivational needs kilitli; kötü niyet algısı         |


---



## 18. Öneri özet matrisi (en yüksek getiri/efor)


| Öncelik | Kod | Başlık                          | Efor | Prensip        | Etki                       |
| ------- | --- | ------------------------------- | ---- | -------------- | -------------------------- |
| P0      | A1  | Session-ending fanfare          | S    | RT-1 · E1      | Retention duygusal         |
| P0      | A2  | Milestone yaklaşım vurgusu      | S    | GO-1/CU-1 · E1 | Anticipation               |
| P0      | A3  | Cooldown mesajını “anlamlı” yap | S    | FL-4 · E1      | Frustration azalır         |
| P0      | A4  | Drop oranı şeffaflığı           | M    | TR-1 · E1      | Kumar şikayeti çözer       |
| P0      | A5  | Daily quest kotası (3–5)        | S    | GO-2 · E1      | Fatigue önler              |
| P0      | A6  | Level tier etiketi              | S    | CO-4 · E1      | Competence görünür         |
| P0      | A7  | Welcome-back pack               | M    | RT-3 · E2      | Absent oyuncuyu geri kazan |
| P0      | I1  | Daily reward hediye dili        | S    | RT-5 · E2      | Extrinsic → intrinsic      |
| P0      | L4  | Error mesajı dili               | S    | TR-2 · E1      | Adalet                     |
| P0      | O2  | Balance changelog süreci        | S    | TR-3 · E1      | Güven                      |
| P1      | B1  | Micro-event hunt varyasyonu     | L    | NO-1 · E1      | Novelty ana loop           |
| P1      | B3  | Session hunt streak (mikro)     | M    | MA-2 · E1      | Flow besler                |
| P1      | B5  | Prey-dex progress + hint        | M    | CU-1 · E1      | Discovery                  |
| P1      | C1  | Level-up functional unlock      | M/L  | CO-3 · E1      | Sahte inflation yok        |
| P1      | C5  | Milestone XP kalibrasyonu       | S    | RW-2 · sınır   | Undermining risk           |
| P1      | D2  | Şeffaf pity                     | M    | RW-3 · E1      | Bad-luck koruma            |
| P1      | D3  | Kozmetik ödül katmanı           | L    | RW-4+ · E1     | Non-power novelty          |
| P1      | E4  | “Bugünkü hedef” tek satır       | S    | GO-1 · E1      | Proximal goal              |
| P1      | F2  | Market fiyat sinyali            | M    | TR-1 · E1      | Yeni oyuncu koruması       |
| P1      | G1  | Guild kolektif hedefi           | L    | RE-3 · E1      | Sosyal retention           |
| P1      | H1  | İlk 30 dk happy path            | M    | CO-3/FL-1 · E1 | Erken retention            |
| P1      | K1  | Prey-dex mystery entries        | M    | CU-1 · E1      | Curiosity engine           |
| P1      | M1  | Gamble istatistik ekranı        | M    | TR-1 · E1      | Adalet algısı              |
| P1      | P1  | Retention analytics             | M    | metrik         | Karar temeli               |
| P2      | B2  | Biome sistemi                   | L    | AN-2/NO-2 · E1 | Uzun vadeli novelty        |
| P2      | C3  | Prestige meta-progression       | L    | LT-2 · E1      | Endgame değeri             |
| P2      | C4  | Skill tree / build kararı       | L    | AN-1 · E1      | Autonomy derinliği         |
| P2      | E1  | Haftalık/sezonluk quest         | L    | LT-1 · E1      | Katmanlı goals             |
| P2      | J1  | Aylık tema event                | L    | NO-2 · E2      | Liveops ritmi              |
| P2      | G5  | Mentor sistemi                  | L    | RE-1 · E1      | Sosyal onboarding          |
| P3      | D4  | Drop hikaye anlatısı            | M    | RW-2/CU-2 · E1 | Anlam eklemesi             |
| P3      | K3  | Gizli mekanik                   | M    | CU-1 · E1      | Discovery                  |
| P3      | O1  | Fair Play dokümanı              | S    | TR-1 · E1      | Şeffaflık                  |
| P3      | K4  | Community wiki                  | S    | RE-3 · E1      | Sosyal içerik              |


---



## 19. İlk 30 gün önerisi (yol haritası)

Kalemler onay geldikçe alınır; bu sadece **öneri sıralaması**dır.

**Hafta 1 (P0 quick-wins)**

- A5 daily quest kotası kontrol
- A6 level tier etiketi
- I1 daily reward hediye dili
- L4 error mesajı dili
- O2 changelog süreci başlat

**Hafta 2 (transparency + retention)**

- A4 drop oranı şeffaflığı
- A2 milestone yaklaşım vurgusu
- A3 cooldown mesajı anlamlandır
- A1 session-ending fanfare
- A7 welcome-back pack

**Hafta 3 (goals + curiosity)**

- E4 bugünkü hedef satırı
- K1 prey-dex mystery entries
- B5 prey-dex progress bar
- M1 gamble istatistik ekranı

**Hafta 4 (ölçüm)**

- P1 retention analytics kur
- P3 quest completion metrik
- P4 milestone claim metrik
- C5 milestone XP kalibrasyonu (metrikle)

Aylık gözden geçirme sonrası P1 kalemler sıraya girer.

---



## 20. Kapanış notu

Bu liste **açık uçlu**dur; rapor ışığında yeni maddeler eklenebilir, mevcutlar iptal edilebilir. Her onaylanan maddede takım şu 3 soruyu sormalı:

1. Bu değişiklik hangi SDT ihtiyacını hangi yolla besler?
2. En kötü uygulanırsa hangi E-sınıfına kayar?
3. Etkiyi ölçmek için hangi metriği izleyeceğiz?

Bu üç soru cevaplanabiliyorsa değişiklik “engagement-first” hedefiyle uyumlu; cevaplanamıyorsa önce tasarım tartışması, sonra kod.

Referans: `[docs/research/player-engagement-motivation-review.md](player-engagement-motivation-review.md)`