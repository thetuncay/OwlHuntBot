# Oyuncu Keyfi, Engagement ve Uzun Vadeli İlgi — Bilimsel Literatür Raporu

> **Kapsam:** Oyuncuların bir oyundan keyif almasını, gönüllü olarak geri dönmesini ve uzun vadede sıkılmadan oynamasını sağlayan psikolojik mekanizmalar. Kaynaklar: hakemli motivasyon, öğrenme, HCI ve oyun araştırması literatürü. Rapor OwlHunt (Discord RPG bot) tasarım kararlarına referans olması için hazırlanmıştır.
>
> **Rapor formatı:** Her ana mekanik için `Mekanizma → Tasarım uygulaması → Sıkılmayı önleme → Kötü uygulama uyarısı (kısa) → Somut oyun örnekleri`.
>
> **Sürüm:** 2026-09-12 · Yazar: OwlHunt research agent · Format: engagement-first (klinik bağımlılık merkezli değil)

---

## 0. Çerçeve ve dil ayrımı (tek seferlik)

Bu raporda “engagement”, “geri dönüş”, “bağlılık” gibi kavramlar bilimsel anlamda kullanılır:

- **Engagement / bağlılık:** Oyuncunun oyuna dair ilgi, keyif ve gönüllü sürdürme davranışı. Motivasyon psikolojisinde intrinsic ilgiye ve tatmine bağlı bir sürekliliktir (Ryan & Deci, 2020).
- **Klinik/patolojik bağımlılık ("gaming disorder"):** DSM-5 / ICD-11 kapsamında işlevsel bozulmayla giden problematik kullanım (King, Delfabbro & Griffiths, 2010; Bäcklund vd., 2022). Bu rapor **bu kategoriyi hedef değildir**.
- **Amacımız:** Oyuncunun oyunda geçirdiği zamanı **keyfe** dönüştürmek; oyuncuya değer sunarak gönüllü geri dönüş sağlamak; içeriği taze tutarak sıkılmayı geciktirmek.
- **Amacımız değildir:** “Zorunlu login streak’i”, “kaybettir-kazandır kancası”, “yapay FOMO tuzağı”, ödeme baskısı, kumar dinamikleri.

Rapor gövdesi engagement bilimidir. Her mekanik bölümünün sonunda kısa bir **“kötü uygulama”** notu vardır — bu, tezin yerini almaz; sınırı çizer.

---

## 1. Kuramsal temel (özet)

Modern oyun tasarımının psikoloji tabanı beş büyük gövdeye dayanır. Rapor boyunca aynı çerçeve geri döner; burada kısaltılmış özet:

### 1.1 Self-Determination Theory (SDT)
İnsan motivasyonunun üç temel psikolojik ihtiyacı vardır: **autonomy** (özerklik/seçim), **competence** (yeterlilik/ustalaşma), **relatedness** (bağlantı) (Ryan & Deci, 2020; DOI: [10.1016/j.cedpsych.2020.101860](https://doi.org/10.1016/j.cedpsych.2020.101860)). Oyunlar bu üç ihtiyacı sık ve yoğun karşılayabildiği için son derece motive edici hale gelir (Ryan, Rigby & Przybylski, 2006; DOI: [10.1007/s11031-006-9051-8](https://doi.org/10.1007/s11031-006-9051-8); Przybylski, Rigby & Ryan, 2010; DOI: [10.1037/a0019440](https://doi.org/10.1037/a0019440)). Bu üç ihtiyacın karşılanma miktarı, oyun keyfini, sonraki oynama niyetini ve iyi oluşu bağımsız olarak yordar.

### 1.2 Flow (optimal deneyim)
Csikszentmihalyi’nin flow modeli: **beceri ↔ zorluk dengesi**, net hedefler, anlık geri bildirim, kontrol hissi, farkındalık ve eylemin birleşmesi, benlik farkındalığı kaybı ve zaman algısı bozulması (Nakamura & Csikszentmihalyi, 2009; DOI: [10.1093/oxfordhb/9780195187243.013.0018](https://doi.org/10.1093/oxfordhb/9780195187243.013.0018)). Oyunlar için Sweetser & Wyeth **GameFlow** modelini geliştirmiştir: concentration, challenge, skills, control, clear goals, feedback, immersion, social interaction (Sweetser & Wyeth, 2005; DOI: [10.1145/1077246.1077253](https://doi.org/10.1145/1077246.1077253)).

### 1.3 Goal-setting theory
Locke & Latham’ın 35 yıllık meta-sentezine göre **spesifik + zorlayıcı ama ulaşılabilir** hedefler performansı ve motivasyonu güvenilir şekilde artırır; bulanık “iyi yap” hedefleri artırmaz (Locke & Latham, 2002; DOI: [10.1037/0003-066X.57.9.705](https://doi.org/10.1037/0003-066X.57.9.705)). Oyun tasarımında bu, **net + yakın (proximal) + görünür ilerleme** demektir.

### 1.4 Curiosity & information-gap
Loewenstein, merakı “fark edilen bilgi boşluğunun yarattığı bilişsel yoksunluk” olarak tanımlar; oyuncu **ne bildiğini bilir ama neyi bilmediğini de bilirse** merak tetiklenir (Loewenstein, 1994; DOI: [10.1037/0033-2909.116.1.75](https://doi.org/10.1037/0033-2909.116.1.75)). Boşluk **çözülebilir** görünmeli.

### 1.5 Reward learning (dopamin ve tahmin hatası)
Dopaminerjik nöronlar **beklenen** değil, **beklenenden farklı** ödüle yanıt verir (reward prediction error; Schultz, Dayan & Montague, 1997; DOI: [10.1126/science.275.5306.1593](https://doi.org/10.1126/science.275.5306.1593)). Bu nörobiyolojik gerçek, oyun tasarımında **anticipation** ve **positive surprise** gücünün kökeni. Aynı olgu, yanlış kullanılırsa (saf değişken ödül → kumar makinesi mantığı) sömürücü hale de gelebilir; ayrım niyet, şeffaflık ve altta yatan competence loop’unda gizli.

Bu beş temel, aşağıdaki 15 mekanikte tekrar tekrar geri döner.

---

## 2. On beş mekanik bölümü

Her bölüm aynı beş soruyu yanıtlar: **Neden etkiliyor · Süreç · Tasarım uygulaması · Sıkılmayı nasıl önler · Kötü uygulanırsa** ve somut oyun örnekleri verir.

### 2.1 Keyfi artıran psikolojik mekanikler (genel çerçeve)

**Neden etkiliyor.** Oyun keyfi tek bir mekanikten değil, çakışan **psikolojik ihtiyaç tatminleri** paketinden doğar. Przybylski vd. 2010’un meta-teorik modelinde “fun” bir estetik yargı değil, **need satisfaction × immersion** çıktısıdır: oyun autonomy/competence/relatedness sağlarsa keyif artar; sağlamazsa grafik ve prodüksiyon değeri bu boşluğu doldurmaz.

**Süreç.** Oyuncu bir aksiyon yapar → sistem net + hızlı geri bildirim verir → oyuncu “yaptım, işe yaradı, sonucu ben belirledim” hisseder → competence + autonomy tetiklenir → duygusal ödül (keyif). Ryan ve Przybylski’nin 4 çalışmalık serisinde bu döngü hem tek oyunculu hem MMO ortamlarında iyi oluş değişimini bağımsız olarak yordadı (Ryan vd., 2006).

**Tasarım uygulaması.**
- Kontroller **sezgisel** olmalı — “control mastery” duygusu autonomy proxy’sidir.
- Her aksiyon **görünür** sonuç doğurmalı (ses, animasyon, sayı).
- Oyuncuya **anlamlı seçim** verilmeli (yanlış sanılan seçim değil).
- Sistem hataları oyuncunun hatası gibi hissettirilmemeli (adalet algısı).

**Sıkılmayı önleme.** Keyif çoğul kaynaktan gelirse tek bir mekanik “eskiyince” diğerleri devreye girer. Tek eksenli oyunlar (yalnızca ödül, yalnızca zorluk) çok hızlı doyar.

**Kötü uygulanırsa.** Keyif yerine yalnızca “baskı” kaldığında — tamamlanması gereken listeler, telafi baskısı, log-in zorunluluğu — oyuncu extrinsic reg. moduna kayar ve intrinsic motivasyon **düşer** (Deci, Koestner & Ryan, 1999; DOI: [10.1037/0033-2909.125.6.627](https://doi.org/10.1037/0033-2909.125.6.627)).

**Örnek oyunlar.** *Zelda: Breath of the Wild* (autonomy + competence + curiosity aynı loop’ta); *Vampire Survivors* (basit kontrol → çok yönlü mastery); *Slay the Spire* (net karar → net sonuç).

---

### 2.2 Intrinsic vs extrinsic motivation

**Neden etkiliyor.** SDT ayrımı: **intrinsic motivation** aktivitenin kendisi için yapılır (keyif, ilgi, merak); **extrinsic motivation** dış sonuç için yapılır (ödül, statü, zorunluluk). Uzun vadeli, sağlıklı engagement’ın çekirdeği **intrinsic** ve **integrated/identified** extrinsic biçimlerdir; **introjected** (suçluluk) ve **external** (baskı) biçimler engagement’ı besler görünse bile keyfi ve iyi oluşu aşındırır (Ryan & Deci, 2020).

**Süreç — kritik bulgu.** Deci, Koestner & Ryan’ın 128 çalışmalık meta-analizi:
- **Beklenen, engagement-contingent maddi ödüller** intrinsic motivasyonu ortalama d ≈ −0.40 zayıflatır (undermining effect).
- **Sözlü olumlu geri bildirim** ise intrinsic motivasyonu d ≈ +0.31 güçlendirir.
- Etki çocuklarda maddi ödül için daha kuvvetli, yetişkinlerde daha zayıf ama yön aynı (Deci, Koestner & Ryan, 1999).

Yani: “bir aktiviteyi ödüllendir → daha çok yapılır” **yalnızca oyuncu zaten ilgisiz** ise doğrudur. Zaten ilgi duyan oyuncuda beklenen tangible ödül, ilgiyi **azaltır**.

**Tasarım uygulaması.**
- Oyunun çekirdek loop’u **kendi başına keyifli** olmalı — ödül sos olmalı, ana yemek değil.
- Ödüller **bilgilendirici (informational)** olsun: “yeteneğin arttı”, “bunu başardın” — “yapmazsan kaybedersin” değil.
- Görev anlatımı **anlam** üzerinden yapılsın (identified/integrated), “çünkü rozet var” değil.
- Zorunlu tamamlanma (must-do list) hissini minimize et.

**Sıkılmayı önleme.** Extrinsic ödül üzerine kurulu oyun, ödül değeri düşünce çöker (endgame boşluğu). Intrinsic loop güçlü olan oyunlar, ödüller kesildiğinde de oynanır (ör. *Minecraft* free-play).

**Kötü uygulanırsa.** Overjustification effect: intrinsic olarak keyifli olan bir mekaniği **ağır extrinsic ödülle** kapla → oyuncu artık “ödül için” yapar → ödül kesilirse davranış çöker (Deci, Koestner & Ryan, 1999). Bu, uzun vadede engagement’ı **artırmaz**, kırılganlaştırır.

**Örnek oyunlar.** *Minecraft* / *Terraria* (neredeyse tamamen intrinsic goal-setting), *Stardew Valley* (yumuşak extrinsic → hızla intrinsic’e dönüşür), karşı örnek: bir dönemin bazı mobile idle oyunları — çekirdek loop tek başına keyifli değil, tamamen dış ödüle bağlı → yüksek erken retention, hızlı çöküş.

---

### 2.3 SDT’nin üç ihtiyacı: Autonomy · Competence · Relatedness

Bu bölüm, oyun literatürünün en tekrarlanabilir bulgu setidir. Aşağıdaki üç alt-blok, SDT’yi doğrudan oyuna uyarlar (Ryan vd., 2006; Przybylski vd., 2010; Tyack & Mekler, 2020, DOI: [10.1145/3313831.3376723](https://doi.org/10.1145/3313831.3376723); Tyack & Mekler, 2024, DOI: [10.1145/3673230](https://doi.org/10.1145/3673230)).

#### Autonomy (özerklik)
- **Ne demek.** Oyuncu aksiyonun kendisinden kaynaklandığını hisseder; “kendi seçimim” duygusu.
- **Tasarım.** Anlamlı seçim (build/spec/strateji); zorunlu tek yol yerine birden fazla geçerli yol; oyuncuya “neyi ne zaman” kontrolü (görevleri sıralama, mola verme).
- **Sıkılmayı önler:** Aynı içerik farklı yollarla oynanabilirse tazelenir.
- **Kötü uygulama:** İllüzyon-seçim (görünen 3 opsiyon, aslında hepsi aynı sonuca gider) uzun vadede algılanır ve autonomy’yi çöker (Tyack & Mekler, 2024 “paradigm” eleştirisi).
- **Örnek.** *Elden Ring* (build/keşif özgürlüğü); *Baldur’s Gate 3* (diyalog + sonuç).

#### Competence (yeterlilik)
- **Ne demek.** “Yapabiliyorum, ilerliyorum” hissi. Salt zorluk değil — **algılanan büyüme**.
- **Tasarım.** Görünür skill/level ilerlemesi; oyuncunun eskiye göre daha iyi olduğunu **hissettirecek** milestone’lar; adil zorluk artışı; hata → öğrenme → düzelme döngüsü.
- **Sıkılmayı önler:** Yeni skill seviyesi yeni içerik açıyorsa (functional progression), competence beslenmeye devam eder.
- **Kötü uygulama:** Sahte competence — ekranda büyük sayılar ama gerçekte oyuncu daha iyi değil (“power creep without mastery”). Kısa vadede tatmin, orta vadede sıkılma.
- **Örnek.** *Souls* serisi (hard-earned competence); *Slay the Spire* (kart bilgisi büyüdükçe daha derin karar); *Rocket League* (rank + mekanik beceri örtüşür).

#### Relatedness (bağlılık)
- **Ne demek.** Başkalarıyla anlamlı bağ; birlikte üretme, yardımlaşma, tanınma.
- **Tasarım.** Kooperatif hedefler; ticaret; guild; ortak sohbet alanı; sosyal statü göstergesi (**değer** temelli, saldırgan hiyerarşi değil).
- **Sıkılmayı önler:** Oyunun içeriği tükendiğinde sosyal bağ oyuncuyu tutar; MMO literatüründe en güçlü retention faktörlerinden.
- **Kötü uygulama:** Zorunlu grup (yalnız oyuncuyu dışlar), toksisiteyi cezalandırmayan sosyal alan.
- **Örnek.** *World of Warcraft* guild yapısı; *Final Fantasy XIV* Novice Network; *Deep Rock Galactic* “Rock and Stone” pozitif norm; Cole & Griffiths’in 912 MMORPG oyuncusu çalışması: sosyal etkileşim **oynama keyfinin büyük bir bileşeni**, oyuncular hayat boyu arkadaşlıklar ve ilişkiler kurdukları oyunları uzun süre sürdürüyor (Cole & Griffiths, 2007; DOI: [10.1089/cpb.2007.9988](https://doi.org/10.1089/cpb.2007.9988)).

**SDT’nin nüansı (2024 eleştirisi).** Tyack & Mekler’in genişletilmiş 259 makalelik incelemesi, HCI oyun literatüründe SDT’nin çoğu zaman **yüzeysel** uygulandığını (yalnızca ölçek olarak PENS) ve teori tenetlerinin **açıkça** işletilmediğini gösterir. Pratik ders: SDT sadece “skorlamak” için değil, tasarım kararı verirken **hangi ihtiyacı, hangi mekanikle, hangi yolla** karşıladığını sormak için kullanılmalı.

---

### 2.4 Flow state

**Neden etkiliyor.** Flow, tam yoğunlaşma, öz-farkındalık kaybı ve “otomatik gibi ama kontrolde” his birleşimidir; kendi başına ödüldür (autotelic). Csikszentmihalyi’nin çok ortamlı çalışmaları bunu keyfin tepe noktası olarak tanımlar (Nakamura & Csikszentmihalyi, 2009).

**Süreç.** Sekiz koşul (GameFlow’a uyarlanmış): concentration, challenge, skills, control, clear goals, feedback, immersion, social interaction (Sweetser & Wyeth, 2005). Kritik iki eksen: **beceri ≈ zorluk** ve **anlık, açık geri bildirim**.

**Tasarım uygulaması.**
- Zorluk artışı, oyuncu becerisi eğrisiyle **paralel** olmalı.
- Her aksiyon **anlık** ve okunabilir bir geri dönüş üretmeli (hasar sayısı, ses, animasyon).
- Kesintiler minimize (loading, cutscene, modal pop-up) — aksiyon → sonuç arasına gereksiz katman koyulmamalı.
- Oyuncuya oyun **dünyasında olduğunu unutturacak** (dolayısıyla akışı bozacak) dış rahatsızlıkları azalt (menü uzunluğu, gereksiz onay).

**Sıkılmayı önleme.** Flow’un korunması, konforlu bir “bant” içinde tutmakla ilgilidir: çok kolay → boredom, çok zor → anxiety. Statik zorluk uzun oyunlarda kaçınılmaz olarak bandan çıkar; yavaş ama sürekli **derinleşme** (mastery içerik açar, açık içerik yeni zorluk verir) doğal DDA yerini tutar.

**Kötü uygulanırsa.** “Zorunlu flow” koşulları oyuncuya baskı olarak hissedilebilir (zaman kısıtı, mola verilemeyen mekanik). Ayrıca: gizli **Dynamic Difficulty Adjustment (DDA)** oyuncu farkederse autonomy ve competence duygusunu zayıflatır — literatür DDA’nın enjoyment/flow üzerinde beklenen etkisini **çoğu kez tutarsız** verdiğini gösterir (Mortazavi vd., 2024, DOI: [10.1007/s11042-024-18768-x](https://doi.org/10.1007/s11042-024-18768-x); ilgili rethinking incelemesi Yin vd., 2024).

**Örnek oyunlar.** *Tetris* (klasik flow prototipi); *Beat Saber* / *osu!* (skill-challenge eşleştirmesi çok net); *Hades* (öl-öğren-tekrar döngüsü); *Celeste* (mikro-checkpoint + hızlı restart, akışı korur).

---

### 2.5 Goal-setting ve anlamlı ilerleme

**Neden etkiliyor.** Belirsiz “iyi oyna” hedefi yerine **spesifik, ölçülebilir, zor ama ulaşılabilir** hedefler dikkat ve çabayı yönlendirir; performans **doğrusala yakın** artar (Locke & Latham, 2002; 4800+ atıf).

**Süreç.** Hedef → dikkat yönlendirme + effort mobilizasyonu + sebat + strateji arama → ilerleme geri bildirimi → tatmin. Kritik iki moderatör: **görev karmaşıklığı** (çok karmaşıksa strateji arama baskın gelir) ve **geri bildirim varlığı** (hedef geri bildirim olmadan işe yaramaz).

**Tasarım uygulaması.**
- **Proximal (yakın) + distal (uzak) hedef katmanı:** bugün 3 hunt, bu hafta lvl 20, bu ay guild raid.
- İlerleme **görünür** olmalı: bar, sayı, milestone, seri.
- Her hedefin **anlamlı çıktısı** olsun (unlock, hikaye ilerlemesi, yeni içerik).
- Oyuncu hedefi kendi **seçebilirse** (autonomy) motivasyon daha yüksek.

**Sıkılmayı önleme.** Hedef **hiyerarşisi** (loop içi 30 sn → oturum 15 dk → gün → hafta → sezon) her ölçekte tatmin sağladığı için, oyuncu “şu an ne yapacağım?” sorusunu asla sormaz. Uzun vadeli hedef, tek başına yeterli değildir — kısa hedeflerle beslenmelidir.

**Kötü uygulanırsa.** Hedef sayısı çok fazlaysa **quest fatigue** oluşur — checklist psikolojisi devreye girer, oyuncu kendi oyununu oynamak yerine listeye yetişmeye çalışır (extrinsic kayma). Frommel & Mandryk’in daily quest çalışması bu tehlikeyi ampirik olarak gösterir: aynı mekanik bazı oyuncularda motivasyon, bazılarında “iş/görev” (Frommel & Mandryk, 2022; DOI: [10.1145/3549489](https://doi.org/10.1145/3549489)).

**Örnek oyunlar.** *Destiny 2* haftalık sıralı hedef katmanı; *Path of Exile* atlas ilerlemesi; *Slay the Spire* run içi mikro-hedef (bu act’i yen, bu boss’u yen); karşı örnek: “50 quest aç, hepsi gereksiz” tarzı mobile UI’lar.

---

### 2.6 Reward systems ve variable rewards (anticipation kaynağı olarak)

**Neden etkiliyor.** Ödüller oyuncunun aksiyonlarını **anlamlı** kılar; ancak asıl güç ödülün kendisinde değil, **ödülün geleceğine dair beklentide** — dopaminerjik nöronların cevabı beklenen değere değil, **beklenti hatasına** verilir (Schultz, Dayan & Montague, 1997). Bu, hem “yakında bir şey iyi olacak” hissinin, hem de **hoş sürprizin** nörobiyolojik temelidir.

**Süreç.**
- **Fixed reward:** her seferinde aynı → kısa sürede öngörülebilir, dopamin yanıtı azalır.
- **Variable ratio (VR):** her N aksiyonda ödül gelmez, ortalama bir oran vardır → beklenti sürekli yenilenir, davranış çok dirençli olur (klasik Skinner literatürü, çağdaş nörobilim doğrular).
- **Loot / drop:** VR + kategorik nadirlik + kolektif keşif → sosyal boyut da eklenir.

Kritik ayrım: **variable reward** intrinsic bir mastery loop’un **üzerine** oturursa engagement’ı besler; loop’un **yerine** geçerse kumar dinamiğine yaklaşır.

**Tasarım uygulaması.**
- Ödüller **oyuncunun performansına** dayansın (competence sinyali).
- Nadir dropların **anlamlı bir seçim/build/koleksiyon** parçası olması → “buldum çünkü ben aradım” duygusu.
- Cömert **base** + nadir **spike** (Diablo tarzı) → hem güvenli tatmin hem sürpriz.
- Ödüller **oyuncuya anlatılan bir hikâyeye** eklemlensin (koleksiyon albümü, guild başarısı) — “rastgele bir sayı arttı” demek yerine.

**Sıkılmayı önleme.** Ödül tipi çeşitliliği (sayısal + kozmetik + progression unlock + sosyal) uzun ömrü artırır. Aynı boyutta VR ödül serisi uzun vadede tekdüzeleşir; ödül **kategorisi** de zaman zaman değişmelidir.

**Kötü uygulanırsa (kısa, önemli).** Saf VR ödül + para ile ödül karıştırma + oyuncunun kaybetmesine bağlı monetization = kumar mekaniği. King, Delfabbro & Griffiths (2010) taxonomisi bu “reward and punishment features” alt kategorisini yapısal risk faktörü olarak listeler (DOI: [10.1007/s11469-009-9206-4](https://doi.org/10.1007/s11469-009-9206-4)); loot-box literatürü kumarla korelasyonu güçlü bulur. **OwlHunt için pratik sınır:** RNG şeffaf, oran ilan edilebilir, gerçek parayla ödül alma yok — o zaman VR bir keyif mekaniği kalır, kumar değil.

**Örnek oyunlar.** *Diablo* serisi (loot loop’un altında güçlü mastery/build sistemi); *Monster Hunter* (drop yalnızca yol, asıl ödül craft ile yeni build → competence); *Hearthstone* arena run’ları (VR + skill); karşı örnek: saf pay-to-loot mobile oyunlar (loot loop tek başına, altta mastery yok → hızlı doygunluk + kumar riski).

---

### 2.7 Curiosity ve anticipation

**Neden etkiliyor.** Merak, bilinçli bir bilgi boşluğunun yarattığı bilişsel gerilimdir; oyuncu **ne bilmediğini bildiğinde** ve boşluğu **doldurabileceğini hissettiğinde** merak tetiklenir (Loewenstein, 1994).

**Süreç.** Merak, kendisi bir tür ödüldür (gap closure = pleasant relief). Ama Loewenstein’in vurgusu: merak **tatmin edildiğinde çoğu zaman sanılandan daha az** haz verir; asıl haz **beklenti**dedir. Bu, oyun tasarımında “teaser + reveal” dinamiğinin niye çalıştığını açıklar.

**Tasarım uygulaması.**
- **Kısmen görünen** bilgi ver: haritanın kenarı, kilit kutunun içinden çıkan ses, karakterin geçmişine dair kırık ipucu.
- Boşluk **çözülebilir görünmeli** (fazla büyükse motivasyon değil bunaltı yaratır).
- Cevap çoğu zaman gecikmeli verilmeli (anticipation süresi tadın büyük parçası).
- **Environmental storytelling**: dünyanın konuşmadan anlattığı ipuçları — merak sürekli beslenir.

**Sıkılmayı önleme.** İyi merak tasarımı, oyuncuya sürekli “şurada ne var?” sorusu üretir. Boş dünya + tekrarlanan içerik = merak ölür; sıkılma başlar.

**Kötü uygulanırsa.** Yapay teaser (“bir şey olacak!” ama olmaz) tekrar tekrar oyuncuyu aldatırsa güven kaybolur, motivasyon çöker. Boşluk **cevapsız** bırakılırsa (kötü sonlanan sırlar) hayal kırıklığı üretir.

**Örnek oyunlar.** *Outer Wilds* (tamamen curiosity motoru üzerinde); *Elden Ring* (harita + item lore); *Hollow Knight* (map/lore boşluğu); *Return of the Obra Dinn* (bilgi tamamlama = ana oyun).

---

### 2.8 Mastery ve skill progression

**Neden etkiliyor.** Kendi becerisinin görünür şekilde büyüdüğünü hisseden oyuncu, competence ihtiyacı yüksek dozda karşılandığı için sürekli geri döner (Ryan vd., 2006). Mastery, extrinsic ödülün en dirençli “internal” alternatifidir.

**Süreç.** Yeni mekanik → başarısızlık → paternlerin öğrenilmesi → tekrar → başarı → yeni mekanik. Bu döngü “learning by doing” psikolojisidir; ödül, sistemin **çalıştığını** görmek.

**Tasarım uygulaması.**
- **Layered mastery:** başlangıçta 1 buton, sonra 3 buton, sonra timing, sonra kombinasyon.
- **Hızlı failure loop:** ölüm/başarısızlık ucuz, tekrar hızlı (Celeste, Hades modeli).
- **Görünür ilerleme:** yeni özellik, yeni animasyon, yeni yetenek ağacı.
- **Skill ceiling görünür ama uzak** olsun — oyuncu her zaman gidecek yer olduğunu hissetsin.

**Sıkılmayı önleme.** Skill ceiling’i düşük olan oyun, tekniğini öğrenen oyuncu için kısa süre sonra doyar. *Chess*, *Go*, *StarCraft* onlarca yıl oynanabilir çünkü ceiling neredeyse yok.

**Kötü uygulanırsa.** “Kağıt üzeri progression” — sayı yükseliyor ama gerçek beceri artmıyor. Oyuncu bir süre sonra “power gain” ile “skill gain” arasındaki uçurumu hisseder ve motivasyon düşer (bazı MMO gear-treadmill eleştirisi).

**Örnek oyunlar.** *Dark Souls* (mastery = ana ödül); *StarCraft II* (mekanik + strateji katmanı); *Slay the Spire* (bilgi/kart tanıma = mastery); *Rocket League* (mekanik ceiling neredeyse sonsuz).

---

### 2.9 Difficulty scaling / sıkılmayı önleme

**Neden etkiliyor.** Flow’un ön koşulu: **beceri ≈ zorluk**. Bu denge kırılırsa iki tarafta da haz kaybolur — kolayda boredom, zorda anxiety.

**Süreç.** Oyuncu becerisi zaman içinde artar; oyun zorluğu da orantılı artmalı veya oyuncuya seçenek verilmeli. Yaklaşımlar:
- **Statik seviye seçimi** (Easy/Normal/Hard): autonomy dostu ama optimal olmayabilir.
- **Aşamalı içerik zorluğu**: seviyeler ilerledikçe içerik daha karmaşık — mastery + goal-setting ile hizalanır.
- **Dynamic Difficulty Adjustment (DDA):** anlık performans/duygu bazlı ayar; teorik olarak ideal ama ampirik olarak **karışık**: bir SLR ve deneyler DDA’nın enjoyment/flow üzerinde belirgin fayda sağlamadığını, hatta oyuncu farkederse zarar verebildiğini gösteriyor (Mortazavi vd., 2024).

**Tasarım uygulaması.**
- Katman katman içerik: erken oyunda mekanikleri öğret, orta oyunda kombinasyon, geç oyunda yaratıcı kullanım.
- **Şeffaf** zorluk seçenekleri (fair): oyuncunun autonomy hissini bozmadan.
- Cezasız pratik alanları (training mode, dojo, sandbox).
- Adaptive öğeler kullanılıyorsa görünmez tut ama **autonomy’ye ters düşme** (oyuncu daha iyi olduğunu hissetsin, sistem “kolaylaştırdı” gibi hissetmesin).

**Sıkılmayı önleme.** Zorluk **çeşidi** (mekanik farklı türde) beceri çeşitliliği yaratır → aynı seviye tekrarı tekdüzeleşmez.

**Kötü uygulanırsa.** Rubber-band DDA (oyuncu öndeyse hep düşman güçlensin) rekabet oyunlarında adalet algısını yıkar; autonomy + competence zarar görür.

**Örnek oyunlar.** *Hades* “heat” sistemi (oyuncu kendi seçtiği zorluğu artırır → autonomy); *Left 4 Dead* AI Director (gizli DDA + zarif); *Resident Evil 4* dinamik zorluk (fark edilmeyen katman); *Dark Souls* (statik ama içerik yapısı zorluk eğrisini taşır).

---

### 2.10 Novelty ve içerik çeşitliliği

**Neden etkiliyor.** Yenilik (novelty), Berlyne’nin klasik “collative variables” çerçevesinde uyarılma ve merak çekicisidir. Beyin, öngörülemeyen ama **öğrenilebilir** yeni girdiye ilgi gösterir; öngörülebilir tekrar hazzı düşürür.

**Süreç.** Yeni içerik → keşif motivasyonu → yeni mastery loop → yeni goal-setting → içerik özümsenir → doygunluk → tekrar yeni içerik ihtiyacı. Oyun eğrisi bu inip çıkışın toplamıdır.

**Tasarım uygulaması.**
- **İçerik enjeksiyonu:** yeni biomes, düşman, item, mekanik, sezon, event.
- **Kombinasyon çeşitliliği:** aynı 20 item’dan binlerce build (procedural depth) — az içerikle çok deneyim.
- **Procedural generation** (rogue-lite, Terraria) → içerik pratik olarak sınırsız görünür.
- Karakter/kostüm/kozmetik yenilik: performansı etkilemese de novelty besler.

**Sıkılmayı önleme.** Yeni içerik + oyuncunun **eskiyi** kullanma yolu birleşince (yeni item eski build’i yeniden düşünmeye zorlar) “içerik-yeniliği” “anlam-yeniliği”ne dönüşür.

**Kötü uygulanırsa.** Yeni içerik ama **yalnızca sayısal power creep** → oyuncu eski progression’ının değersizleştiğini hisseder → competence yıkımı. Ayrıca içerik zerk hızı tükeniyorsa, novelty’ye alışan oyuncu için “normal” dahi eksiklik gibi hissedilir (adaptation).

**Örnek oyunlar.** *No Man’s Sky* (procedural + expansion + season); *Path of Exile* league system; *Rimworld* + mods; *Vampire Survivors* (küçük değişiklik → yeni build hissi).

---

### 2.11 Social interaction ve community

**Neden etkiliyor.** SDT’de relatedness ihtiyacı; oyunun sosyal boyutu hem tek başına ödüldür (dostluk, tanınma, birlikte başarma), hem de içerik tükendiğinde retention’ı ayakta tutar. Cole & Griffiths’in 912 MMORPG oyuncusu üzerindeki çalışması, oyunun sosyal etkileşiminin **oynama keyfinin önemli bir bileşeni** olduğunu ve önemli bir kısmının **gerçek hayat arkadaşlıkları** kurduğunu gösterdi (Cole & Griffiths, 2007). Ryan vd. 2006 4. çalışmasında relatedness, sonraki oynama niyetini bağımsız olarak yordadı.

**Süreç.** Ortak hedef → koordinasyon → başarı → paylaşılan tatmin + bağ; sohbet → tanınma → guild identity → uzun vadeli aidiyet.

**Tasarım uygulaması.**
- Koop hedefleri (raid, guild challenge).
- Ticaret / hediye (asenkron sosyal bağ).
- **Etkileşim yüzeyi düşük giriş engelli**: emote, ping, kısa mesaj — konuşmak zorunda değil.
- Pozitif normu güçlendiren tasarım (Deep Rock Galactic “Rock and Stone”, FFXIV Novice Network).
- Statü ve tanınma sistemleri (guild banner, MVP, spotlight) — **saygı ekonomisi**, hakaret ekonomisi değil.

**Sıkılmayı önleme.** İçerik doygunluğu geldikten sonra oyuncuyu tutan çoğunlukla insanlardır; MMO literatüründe en tutarlı bulgu bu.

**Kötü uygulanırsa.** Zorunlu grup (yalnız oyuncuyu dışlar), toksisite serbest bir sohbet, mikrofoncu-only kooperasyon → yeni oyuncu dışlanır. Bäcklund vd. (2022) meta-analizinde **emotional escape** motivasyonu problem gaming ile en güçlü ilişkiye sahip; **social** ve **mastery** motivasyonları riskle çok daha zayıf ilişkili (DOI: [10.1556/2006.2022.00053](https://doi.org/10.1556/2006.2022.00053)) — yani sağlıklı sosyal engagement bir risk faktörü değil, koruyucu bir faktör olarak öne çıkıyor.

**Örnek oyunlar.** *FFXIV* (kabul edilen en “nazik” MMO topluluklarından); *World of Warcraft* Classic (guild ekonomisi); *Deep Rock Galactic* (pozitif norm tasarımı); Discord bot oyunları — trade + guild ile relatedness kolay tetiklenir.

---

### 2.12 Long-term progression

**Neden etkiliyor.** İnsan zaman içinde büyüme hissini derinden ödüllendirici bulur (self-continuity + competence + autonomy). Uzun vadeli progression, kısa loop’ların üzerine bir **anlam kubbesi** koyar.

**Süreç.** Küçük tatmin (loop) → orta tatmin (oturum) → büyük tatmin (milestone) → çok büyük tatmin (endgame / sezon zirvesi). Her katman farklı zaman ölçeğinde tekrar etmeli.

**Tasarım uygulaması.**
- Katmanlı progression: XP → level → skill tree → prestige/paragon → sezon.
- **Kalıcı ilerleme** (kalır) + **döngüsel ilerleme** (sezonda resetlenir → yeni kazanım hedefi).
- Milestone’ların **anlamlı unlock** vermesi (yeni mekanik/alan/rol) — sadece sayı değil.
- Uzun vadeli hedeflerin **ihtiyacı olan zamanla orantılı** kutlanması (küçük fanfare yerine gerçek etkinlik).

**Sıkılmayı önleme.** Grinding tekdüzeleşmesin diye orta katmanlar (yeni build, yeni etkinlik, yeni sosyal görünürlük) sık sık aktive edilmeli.

**Kötü uygulanırsa.** Sonu görünmez bir grind (asimptotik power creep) motivasyonu tüketir; **prestige reset** rızasız yapılırsa competence hissi çakılır.

**Örnek oyunlar.** *Path of Exile* atlas + league; *Destiny 2* seasonal artifact; *Warframe* mastery rank; *WoW* raid + Mythic+ döngüsü.

---

### 2.13 Retention ve replayability (sağlıklı geri dönüş)

**Neden etkiliyor.** Bir oyunu “bitirdikten sonra da” oynanır kılan şey: değişkenlik (procedural / meta-progression), sosyal bağ, mastery derinliği, sezonluk taze içerik. Retention **hile ile** değil, **değer ile** kurulan bir uzun ilişkidir.

**Süreç.**
- **Procedural replayability:** her run farklı (rogue-lite, deck-builder, sandbox).
- **Meta-progression across runs:** başarısızlık dahi ilerleme.
- **Player-generated content:** mods, custom levels, oyuncuların içerik ürettiği ekonomi.
- **Sezonluk taze içerik:** yeni tema + yeni mekanik + eski oyuncu için yeni hedef.

**Tasarım uygulaması.**
- Meta-currency ile run’lar birbirine bağlansın (Hades keramik / karanlık; Dead Cells cells).
- Her oyun oturumu **kendi başına** tatmin bıraksın (kısa oturum-friendly loop) — kısa süreli oyuncu için de değer.
- **Grace mekanikleri**: oyuncu bir hafta ara verirse mahkum edilmesin (ceza streaks yerine geri kucaklayan onboarding).

**Sıkılmayı önleme.** Uzun ömür = kısa loop keyifli **× yeterli çeşit × sağlıklı sosyal + progression üstyapı**. Tek bileşen eksikse orta vadeli döngü kırılır.

**Kötü uygulanırsa.** “FOMO tabanlı retention” (log in etmezsen ödül kaybolur) kısa vadede DAU artırır, orta vadede oyuncu tüketimini artırır (churn: oyuncu tükenip bırakır). Frommel & Mandryk 2022 daily reward çalışması: aynı mekanik bazı oyunculara motivasyon, önemli bir alt grupta ise **stres, zorunluluk, chore** hissi verdi; yazarlar **kaçırma cezasını azaltmanın** uzun vadeli retention’ı artırabileceğini öneriyor.

**Örnek oyunlar.** *Hades* (meta-progression + narrative); *Slay the Spire* (procedural depth); *Balatro* (basit çekirdek + kombinasyon patlaması); *Stardew Valley* (grace-friendly daily); *Path of Exile* (sezon reset + kalıcı derinlik).

---

### 2.14 Geri dönüşü sağlayan **sağlıklı** design prensipleri

**Neden etkiliyor.** Oyuncu, oyunun ona **değer sunduğunu** hissettiği için geri döner — “kaçırırsam kaybederim” korkusu için değil. Sağlıklı retention, iyi oluş ile pozitif korelasyon gösterir; escape-driven kullanım problematik gaming ile ilişkilidir (Bäcklund vd., 2022; Ryan & Deci, 2020).

**Süreç.**
1. Oyuncu oturumdan **iyi hisle** ayrılır (positive session end).
2. Bir sonraki oturumun **anlamlı bir sonucu** olacağını **bilir** (proximal goal + curiosity).
3. Ara verildiğinde **cezalandırılmadığını** bilir.
4. Geri döndüğünde oyunun **onu bıraktığı yerden** açıp devam ettirdiğini görür.

**Tasarım uygulaması (checklist).**
- Session-ending fanfare (küçük ama net kutlama).
- “Bir sonraki hedef” göstergesi (bekleyen quest, milestone, event).
- Grace-friendly streak (24s+ tolerans, silent reset, unyıkıcı geri dönüş).
- Ara vermenin telafisi (login rewards yerine “welcome back” pack — küçük, tek seferlik).
- Absent-friendly ekonomi (piyasa/timer oyuncuyu 24s başında olma zorunluluğuna sürüklemesin).

**Sıkılmayı önleme.** İçeriğin “yeni ne var?” sinyali her giriş anında oyuncuya net gösterilir; oyun oyuncunun zamanına saygılı ise oyuncu da oyunun içeriğine saygılı olur.

**Kötü uygulanırsa.** Streak baskısı, günlük login zorunluluğu, kaçırılmış özel öğe FOMO’su → dark pattern sınırına yaklaşır (Frommel & Mandryk, 2022). Kısa vadede DAU artışı gerçektir; uzun vadede oyuncu **kırgın bir şekilde bırakır**.

**Örnek oyunlar.** *Animal Crossing: New Horizons* (baskısız daily); *Stardew Valley* (mevsim döngüsü, cezasız); *Powerwash Simulator* (istediğinde bırak, istediğinde dön); karşı örnek: son yılların bazı live-service oyunları — battle pass FOMO’su oyuncuları tüketti (public discourse).

---

### 2.15 Başarılı oyunlardan somut örnekler (mekanik → prensip)

Bu bölüm, önceki 14 mekaniği somut oyunlarla eşler:

| Oyun / Mekanik | Öne çıkan psikolojik ilke |
| --- | --- |
| *Zelda: Breath of the Wild* – açık dünya keşif | Autonomy + curiosity + emergent mastery |
| *Elden Ring* – build/keşif özgürlüğü | Autonomy + competence + curiosity + hard-earned mastery |
| *Slay the Spire* – deck-building run | Goal-setting (proximal/distal) + variable reward on top of mastery |
| *Hades* – narrative meta-progression | Failure → progression + relatedness (NPC bağı) + mastery |
| *Vampire Survivors / Balatro* – kombinasyon patlaması | Az içerik + derin çeşitlilik → novelty from combinatorics |
| *Stardew Valley* – mevsim döngüsü | Long-term progression + baskısız daily + relatedness (NPC) |
| *Animal Crossing: New Horizons* – gündelik ritm | Grace-friendly retention, low-pressure relatedness |
| *Final Fantasy XIV* – onboarding + Novice Network | Pozitif sosyal norm tasarımı, relatedness tetiklemesi |
| *Deep Rock Galactic* – “Rock and Stone” | Community norm design, koop relatedness |
| *Rocket League / StarCraft II* – sonsuz skill ceiling | Deep, layered mastery |
| *Diablo IV / Path of Exile* – loot loop | Reward variability + build mastery + long-term progression |
| *Outer Wilds* – bilgi tabanlı keşif | Pure curiosity engine, information gaps as core loop |
| *Discord RPG botları (Owoblack, Idle, OwlHunt vb.)* | Kısa oturum-friendly loop + long-term progression + guild relatedness |

Ders: farklı türlerde başarı, **çok az sayıda** temel psikolojik ilkeyi (SDT + flow + goal-setting + curiosity + variable reward) mekanik dilinde farklı biçimlerde uygular. Formül tek değildir; ilkeler evrenseldir.

---

## 3. Uygulanabilir tasarım prensipleri (checklist)

Aşağıdaki liste, önceki 15 bölümden damıtılmış ve OwlHunt’a taşınabilir tasarım prensipleridir. **E-sınıflandırma:**

- **E1** Keyfi / intrinsic motivasyonu güçlendiren
- **E2** Gönüllü alışkanlık / geri dönüş ritmi oluşturan (sağlıklı)
- **E3** Extrinsic baskıya kayarsa keyfi zayıflatabilen
- **E4** Kumar/FOMO manipülasyonuna yaklaşma riski (uyarı)
- **E5** Kanıtı henüz ince olan iddialar

### 3.1 Autonomy prensipleri (E1)
- **AN-1** Her build/loadout kararı **gerçek** olmalı — dominant strateji yoksa çeşitlilik sağlıklıdır.
- **AN-2** Zorunlu tek-yol quest sırası minimize; “ne zaman ne yapacağını” oyuncu seçebilsin.
- **AN-3** Oyuncuya “şu an ne oynayacağını” dayatan modal pop-up’lar azaltılsın.
- **AN-4** Aynı sonucu farklı yollardan elde edebilme (competence + autonomy birlikte).

### 3.2 Competence prensipleri (E1)
- **CO-1** Her aksiyon **görünür sonuç** üretsin (sayı, animasyon, ses).
- **CO-2** Zorluk artışı beceri artışına paralel; oyuncu “dün yapamadığımı bugün yapıyorum” hissetsin.
- **CO-3** Yeni mekanik açıldığında **öğretimi** kısa, denemesi ucuz olsun.
- **CO-4** Progression sayıları anlamlı olsun; sahte inflation power yaratmasın.

### 3.3 Relatedness prensipleri (E1)
- **RE-1** Ticaret, hediye ve koop hedef sık ve düşük engelli olsun.
- **RE-2** Pozitif norm sinyalleri (kelime, emote, community ritüel) tasarıma yerleştirilsin.
- **RE-3** Guild/community ilerlemesi **kolektif** kutlansın; birey rekabetinin **üzerinde** bir katman.
- **RE-4** Yalnız oyuncu dışlanmasın — solo yol geçerli kalsın.

### 3.4 Flow ve zorluk (E1)
- **FL-1** Ana loop 5–15 saniyede net geri bildirim versin.
- **FL-2** Zorluk seçimi oyuncuya bırakılabilirse bırakılsın (Hades heat modeli).
- **FL-3** DDA kullanılıyorsa şeffaflık ve autonomy bozulmasın (E5 – etki karışık).
- **FL-4** Load/menu/onay ekranları flow’u kesmesin.

### 3.5 Goal-setting (E1)
- **GO-1** Proximal + distal hedef katmanı görünür olsun.
- **GO-2** Aktif hedef sayısı kısıtlı (3–5) — quest fatigue’den kaçın.
- **GO-3** Her hedef **anlamlı** unlock/sonuç doğursun.
- **GO-4** Oyuncu kendi hedefini seçebilsin (autonomy ile hizalı).

### 3.6 Reward ve variability (E1 + E4 uyarı)
- **RW-1** Cömert base + nadir spike; her tıklama tatmin.
- **RW-2** VR ödüller, altta güçlü mastery loop olduğunda kullan.
- **RW-3** Drop oranları oyuncuya şeffaf iletilebilsin (algılanan adalet).
- **RW-4** Gerçek parayla nadir ödül alma (loot box monetization) → **yapma**.

### 3.7 Curiosity (E1)
- **CU-1** Haritada/UI’de “orada bir şey var” sinyalleri (kısmen görünür).
- **CU-2** Lore/tarih parçalı ve keşif yoluyla ortaya çıksın.
- **CU-3** Cevaplar **cevap** olsun — kronik teaser oyuncuyu aldatır.
- **CU-4** Environmental storytelling (dünya konuşur).

### 3.8 Mastery (E1)
- **MA-1** Layered mekanik: 1 → 3 → timing → kombinasyon.
- **MA-2** Failure ucuz, tekrar hızlı.
- **MA-3** Ceiling görünür ama uzak — hep tırmanılacak bir tepe olsun.
- **MA-4** Meta-mastery (kural bilgisi, meta strateji) ödüllensin.

### 3.9 Novelty (E1)
- **NO-1** Kombinasyon tabanlı derinlik (az içerikle çok deneyim).
- **NO-2** Sezonluk taze içerik (yeni event, yeni mekanik, yeni tema).
- **NO-3** Yeni içerik eski progression’ı **değersizleştirmesin** (power creep dikkat).

### 3.10 Long-term progression (E1 + E2)
- **LT-1** Katmanlı progression: level → skill → prestige → sezon.
- **LT-2** Kalıcı + döngüsel bileşen birlikte.
- **LT-3** Uzun hedefler için gerçek fanfare (tıklama ötesi kutlama).
- **LT-4** Endgame **taze mekanik** getirmeli, sadece daha büyük sayı değil.

### 3.11 Retention / geri dönüş (E2 + E3/E4 uyarı)
- **RT-1** Session-ending fanfare + “next-time hook” (spoiler değil, teaser).
- **RT-2** Grace-friendly streak (silent reset; 24s+ tolerans).
- **RT-3** Zorunlu login **yok**; welcome-back **var**.
- **RT-4** FOMO’lu event tasarımı **kaçın**; iyi event = keyifli + döngüsel + kaçıran için minimal telafi.
- **RT-5** Daily reward tasarımı: hediye hissi ver, borç hissi verme (Frommel & Mandryk 2022 dark side uyarısı).

### 3.12 Şeffaflık ve adalet (E1)
- **TR-1** RNG oranları öngörülebilir/açıklanabilir olsun.
- **TR-2** Sistem hatası oyuncunun hatası gibi hissettirilmesin.
- **TR-3** Ekonomi/oran değişikliklerini oyuncuya açıkla — algılanan adalet uzun vadeli güvenin temeli.

---

## 4. OwlHunt eşlemesi (mevcut mekanikler ↔ SDT + prensipler)

Bu bölüm bir tasarım kararı değil, **teşhis** ve **iyileştirme çerçevesi**. Kod önerisi yok; ilke önerisi var.

### 4.1 Hunt (ana loop)
- **SDT ihtiyacı:** Competence (kill/xp/drop görünür), Autonomy (nerede/ne zaman), Curiosity (drop RNG).
- **Prensipler:** CO-1, CO-2, FL-1, RW-1, RW-2, TR-1.
- **Güçlü yön:** Kısa, tekrar edilebilir, sürprizli — flow’a uygun.
- **Sıkılma riski:** Tek düze reward eğrisi (aynı düşman, aynı drop, aynı sayı).
- **Sağlıklı iyileştirme fikri (E1):** biome/event çeşitliliği (NO-1/NO-2), streak/milestone sistemi ile katmanlı goal-setting (GO-1) — mevcut hunt-milestone bu mantığa oturuyor.
- **Kötü uygulama uyarısı:** Milestone ödülü **çok yüksek** olursa oyuncu hunt’ı milestone için yapar → intrinsic → extrinsic kayması (E3, Deci vd. 1999).

### 4.2 Upgrade / owl leveling (mastery motoru)
- **SDT ihtiyacı:** Competence (asıl kaynak), Autonomy (hangi baykuşu, ne zaman).
- **Prensipler:** CO-2, MA-1, MA-3, LT-1.
- **Güçlü yön:** Görünür ilerleme, kalıcı progression.
- **Sıkılma riski:** Doğrusal power creep, geç oyunda anlamsızlaşan lvl-up.
- **Sağlıklı iyileştirme fikri:** Level açılışına **mekanik unlock** (yeni yetenek, yeni build seçeneği) — sadece sayı değil.
- **Kötü uygulama uyarısı:** Grind döngüsü tek eksende çok uzarsa competence yerini yorgunluk alır.

### 4.3 Trade / market (relatedness + autonomy)
- **SDT ihtiyacı:** Relatedness (birebir etkileşim), Autonomy (ekonomik karar).
- **Prensipler:** RE-1, AN-4, TR-2.
- **Güçlü yön:** Trade panel’i ekseriya asenkron ve düşük engelli — yeni oyuncu dışlanmıyor.
- **Sıkılma riski:** Piyasa dominant metaya kilitlenirse (herkes aynı 3 item’ı takas eder) autonomy düşer.
- **Sağlıklı iyileştirme fikri:** Zaman zaman event-item’lar farklı meta yaratsın (novelty enjeksiyonu, NO-2).
- **Kötü uygulama uyarısı:** Trade yalnızca dominant meta ekonomisine hizmet ediyorsa küçük guild’ler dışlanır.

### 4.4 Daily / streak sistemleri
- **SDT ihtiyacı:** Habit (E2 gönüllü); yanlış yapılırsa external regulation (E3/E4).
- **Prensipler:** RT-2, RT-3, RT-4, RT-5.
- **Güçlü yön (mevcut):** OwlHunt streak’i silent reset (kullanıcı isteği doğrultusunda ceza mesajı yok) → grace-friendly.
- **Sıkılma riski:** Reward monoton olursa daily “chore” olur.
- **Sağlıklı iyileştirme fikri:** Daily quest çeşitlensin; welcome-back pack ile ara veren oyuncu kutsansın.
- **Kötü uygulama uyarısı:** Streak’in boyutunu görsel olarak **utandırıcı** biçimde göstermek, cezasız bile olsa introjected regulation üretir (Frommel & Mandryk, 2022).

### 4.5 Quest / görev sistemi
- **SDT ihtiyacı:** Competence + Autonomy + goal-setting.
- **Prensipler:** GO-1, GO-2, GO-3.
- **Güçlü yön:** Net + kısa görev = proximal goal.
- **Sıkılma riski:** Görev sayısı çok fazlaysa quest fatigue → oyun görev listesine dönüşür.
- **Sağlıklı iyileştirme fikri:** Aktif quest kotası (aynı anda ~3–5); tamamlanan quest’in mekaniği bir sonrakine bilgi geçirsin (chained learning).
- **Kötü uygulama uyarısı:** Quest ödüllerini oyuncu **çekirdek loop’u atlayarak** birikime çevirebilirse core loop devre dışı kalır (extrinsic kayma).

### 4.6 PvP / rekabetçi katman (varsa/gelecekte)
- **SDT ihtiyacı:** Competence (mastery gösterimi), Relatedness (rakiple sosyal bağlam), Autonomy (ne zaman/kime karşı).
- **Prensipler:** CO-2, RE-3, FL-2, TR-3.
- **Sıkılma riski:** Matchmaking dengesizse flow bozulur; toksisite relatedness’ı yıkar.
- **Sağlıklı iyileştirme fikri:** Fair matchmaking + net rank hedefi (goal-setting); pozitif norm iletişimi.
- **Kötü uygulama uyarısı:** Rubber-band DDA rekabette adalet algısını yıkar (E4 sinyali).

### 4.7 Cross-cutting: kumar hissi (mevcut oyuncu şikayeti)
Kullanıcı oyuncu şikayetini aktardı: “10 elde 1 kere bile kazanamadım”. Bu bir **algılanan adalet** problemidir — mutlaka gerçek RNG problemi değil.
- **Sağlıklı yaklaşım (E1 + TR-1/3):**
  - Oranları oyuncuya göster/ilan et (şeffaflık).
  - Pity/bad-luck koruması: N art arda kayıptan sonra buff, sinsi değil şeffaf.
  - Kısa vadeli seri hissi için kısmen görünür progression (“3 el daha yakınsın”).
  - “Bilerek kazandır” **değil** — bu tam olarak dark pattern sınırıdır ve uzun vadede güveni yıkar (algılanır ve oyuncu bırakır).
- **Sonuç:** Oyuncu şikayeti manipülasyonla değil, iletişim + adil VR tasarımı + pity ile çözülür.

---

## 5. Ek: Risk sınırı — mekanikler dark pattern’a ne zaman kayar?

Kısa, bilimsel çerçevede. Bu bölüm ana tez değil, sınır çizgisi.

### 5.1 Variable reward → kumar mekaniği
- Sınır: Ödül **gerçek para** ile karışırsa, oyuncu ödülü almak için harcama yaparsa ve altta güçlü bir mastery/anlam loop’u yoksa → kumar dinamiği.
- Literatür: King, Delfabbro & Griffiths (2010) “reward and punishment features” taxonomisi bunu yapısal risk faktörü olarak listeliyor. Loot box literatürü kumar semptomlarıyla korelasyon buluyor (**korelasyon; nedensellik değil**).
- OwlHunt için pratik: gerçek para karışmıyor, oranlar açıklanabilir → sınır aşılmamış.

### 5.2 Streak / daily → FOMO
- Sınır: Bir gün kaçırınca büyük bir şey **gerçekten** kaybedilirse ve bu görsel olarak baskı yaratılırsa → introjected/external regulation. Frommel & Mandryk (2022): daily reward tasarımı bir alt grup için **stres, zorunluluk, chore** anlamına geldi.
- OwlHunt için pratik: silent reset + cezasız = sağlıklı çizgide.

### 5.3 Grind → tükenme
- Sınır: Anlamlı içerik yerine oyuncu **saf tekrar**la ilerlemeye zorlanırsa ve alternatif yoksa competence tükenir. Bäcklund vd. (2022): **emotional escape** motivasyonu problem gaming ile en güçlü ilişkiye sahip; oyuncuyu tek çıkış olarak grind’e sürüklemek risk faktörü.

### 5.4 Sosyal baskı → toksisite
- Sınır: Grup güveni tasarımla desteklenmezse relatedness ihtiyacı negatif dış motive olur (utanç, korku).

### 5.5 Cognitive/behavioral hooks
- Sınır: Casus davranış izleme, dark pattern nudge, aldatıcı UI (fake urgency timer) — hem etik hem uzun vadede güven yıkıcı.

---

## 6. Özet — en güçlü 10 engagement mekanizması

1. **SDT üçlüsü karşılanır** (autonomy + competence + relatedness) — tek en güçlü yordayıcı (Ryan vd. 2006; Przybylski vd. 2010).
2. **Kısa loop’ta net + hızlı geri bildirim** — flow ve competence ana damarı.
3. **Katmanlı goal-setting** (proximal + distal) — sürekli “şimdi ne yapayım” cevabı (Locke & Latham 2002).
4. **Anticipation için VR ödül** — ama altta güçlü mastery loop varsa.
5. **Merak boşlukları** — kısmen görünür, çözülebilir bilgi eksikleri (Loewenstein 1994).
6. **Görünür ve derin mastery eğrisi** — yüksek ceiling, hızlı failure loop.
7. **Sağlıklı sosyal bağ** — pozitif norm, ticaret/hediye, koop hedefler (Cole & Griffiths 2007).
8. **Yenilik enjeksiyonu** (sezon, event, procedural) — doygunluğa karşı.
9. **Grace-friendly retention** — cezasız daily, welcome-back, session-ending fanfare (Frommel & Mandryk 2022’nin “iyi taraf”).
10. **Şeffaflık ve algılanan adalet** — RNG oranları, iletişim, oyuncunun hatası gibi hissettirmeme.

### Bilinmeyenler / kanıtı ince alanlar (E5)
- DDA’nın enjoyment üzerinde net faydası: sistematik incelemelerde tutarsız (Mortazavi vd. 2024).
- Gamification öğelerinin “neyi neye” motive ettiği: Sailer vd. 2017 badge/leaderboard → competence, avatar/story → relatedness gösterdi ama **decision freedom** artmıyor; Hamari, Koivisto & Sarsa (2014) genel etkilerin bağlama ve kullanıcıya bağlı olduğunu vurguladı.
- Daily reward tasarımının **uzun vadeli** retention etkisi: kısa dönem DAU’ya etkisi belgeli, aylar/yıl ölçeğinde uzun vadeli çalışma kısıtlı (Frommel & Mandryk 2022 çıkarımdır).
- HCI’da SDT uygulamasının teori derinliği zayıf: Tyack & Mekler 2020/2024 “paradigma yüzeysel” eleştirisi — pratik olarak “PENS ile ölçüldü, bitti” yaklaşımı yeterli değil.

---

## 7. Ana akademik kaynaklar (etiketli)

Kaynak sınıflandırması: **P** = birincil/deneysel çalışma, **SR** = sistematik inceleme, **MA** = meta-analiz, **T** = teorik/kavramsal çerçeve, **R** = literatür incelemesi.

1. **[T]** Ryan, R. M. & Deci, E. L. (2020). Intrinsic and extrinsic motivation from a self-determination theory perspective: Definitions, theory, practices, and future directions. *Contemporary Educational Psychology*, 61, 101860. DOI: [10.1016/j.cedpsych.2020.101860](https://doi.org/10.1016/j.cedpsych.2020.101860).
2. **[P]** Ryan, R. M., Rigby, C. S. & Przybylski, A. (2006). The Motivational Pull of Video Games: A Self-Determination Theory Approach. *Motivation and Emotion*, 30(4), 344–360. DOI: [10.1007/s11031-006-9051-8](https://doi.org/10.1007/s11031-006-9051-8).
3. **[R]** Przybylski, A. K., Rigby, C. S. & Ryan, R. M. (2010). A Motivational Model of Video Game Engagement. *Review of General Psychology*, 14(2), 154–166. DOI: [10.1037/a0019440](https://doi.org/10.1037/a0019440).
4. **[T]** Sweetser, P. & Wyeth, P. (2005). GameFlow: A Model for Evaluating Player Enjoyment in Games. *Computers in Entertainment*, 3(3), 3. DOI: [10.1145/1077246.1077253](https://doi.org/10.1145/1077246.1077253).
5. **[T/R]** Nakamura, J. & Csikszentmihalyi, M. (2009). Flow Theory and Research. In *The Oxford Handbook of Positive Psychology* (pp. 194–206). Oxford University Press. DOI: [10.1093/oxfordhb/9780195187243.013.0018](https://doi.org/10.1093/oxfordhb/9780195187243.013.0018).
6. **[R]** Locke, E. A. & Latham, G. P. (2002). Building a Practically Useful Theory of Goal Setting and Task Motivation: A 35-Year Odyssey. *American Psychologist*, 57(9), 705–717. DOI: [10.1037/0003-066X.57.9.705](https://doi.org/10.1037/0003-066X.57.9.705).
7. **[R/T]** Loewenstein, G. (1994). The Psychology of Curiosity: A Review and Reinterpretation. *Psychological Bulletin*, 116(1), 75–98. DOI: [10.1037/0033-2909.116.1.75](https://doi.org/10.1037/0033-2909.116.1.75).
8. **[MA]** Deci, E. L., Koestner, R. & Ryan, R. M. (1999). A Meta-Analytic Review of Experiments Examining the Effects of Extrinsic Rewards on Intrinsic Motivation. *Psychological Bulletin*, 125(6), 627–668. DOI: [10.1037/0033-2909.125.6.627](https://doi.org/10.1037/0033-2909.125.6.627).
9. **[P]** Schultz, W., Dayan, P. & Montague, P. R. (1997). A Neural Substrate of Prediction and Reward. *Science*, 275(5306), 1593–1599. DOI: [10.1126/science.275.5306.1593](https://doi.org/10.1126/science.275.5306.1593).
10. **[P]** Cole, H. & Griffiths, M. D. (2007). Social Interactions in Massively Multiplayer Online Role-Playing Gamers. *CyberPsychology & Behavior*, 10(4), 575–583. DOI: [10.1089/cpb.2007.9988](https://doi.org/10.1089/cpb.2007.9988).
11. **[SR]** Tyack, A. & Mekler, E. D. (2020). Self-Determination Theory in HCI Games Research: Current Uses and Open Questions. *CHI ’20 Proceedings*, Article 594, 1–22. DOI: [10.1145/3313831.3376723](https://doi.org/10.1145/3313831.3376723).
12. **[SR]** Tyack, A. & Mekler, E. D. (2024). Self-Determination Theory and HCI Games Research: Unfulfilled Promises and Unquestioned Paradigms. *ACM TOCHI*. DOI: [10.1145/3673230](https://doi.org/10.1145/3673230).
13. **[P]** Sailer, M., Hense, J. U., Mayr, S. K. & Mandl, H. (2017). How gamification motivates: An experimental study of the effects of specific game design elements on psychological need satisfaction. *Computers in Human Behavior*, 69, 371–380. DOI: [10.1016/j.chb.2016.12.033](https://doi.org/10.1016/j.chb.2016.12.033).
14. **[R]** Hamari, J., Koivisto, J. & Sarsa, H. (2014). Does Gamification Work? — A Literature Review of Empirical Studies on Gamification. *HICSS 2014*, 3025–3034. DOI: [10.1109/HICSS.2014.377](https://doi.org/10.1109/HICSS.2014.377).
15. **[P/SR-hybrid]** Frommel, J. & Mandryk, R. L. (2022). Daily Quests or Daily Pests? The Benefits and Pitfalls of Engagement Rewards in Games. *Proceedings of the ACM on Human-Computer Interaction, 6 (CHI PLAY)*, Article 226, 1–23. DOI: [10.1145/3549489](https://doi.org/10.1145/3549489).

Ek risk-sınırı çerçevesi için ikincil kaynaklar:

- **[T/R]** King, D. L., Delfabbro, P. H. & Griffiths, M. D. (2010). Video Game Structural Characteristics: A New Psychological Taxonomy. *International Journal of Mental Health and Addiction*, 8(1), 90–106. DOI: [10.1007/s11469-009-9206-4](https://doi.org/10.1007/s11469-009-9206-4).
- **[SR/MA]** Bäcklund, C., Elbe, P., Gavelin, H. M., Eriksson Sörman, D. & Ljungberg, J. K. (2022). Gaming motivations and gaming disorder symptoms: A systematic review and meta-analysis. *Journal of Behavioral Addictions*, 11(3), 667–688. DOI: [10.1556/2006.2022.00053](https://doi.org/10.1556/2006.2022.00053).
- **[SR]** Mortazavi, F. vd. (2024). Dynamic difficulty adjustment approaches in video games: a systematic literature review. *Multimedia Tools and Applications*. DOI: [10.1007/s11042-024-18768-x](https://doi.org/10.1007/s11042-024-18768-x).

---

## 8. Kapanış notu

Bu rapor bir “yap-yapma listesi” değildir. **Prensip haritasıdır**: SDT + flow + goal-setting + curiosity + reward learning ekseninde, oyuncunun keyfini merkeze koyan ve uzun vadeli bağlılığı **değer ile** kuran tasarım kararlarını rehberler.

Tek cümlelik özet: **Oyuncuya saygılı, competence besleyen, autonomy koruyan, relatedness açan, meraka ve mastery’ye alan bırakan bir oyun; uzun vadede kaçırılan-değil-özlenen bir oyundur.**
