# OwlHunt — Temel Tasarım Bilimsel Stres Testi (Core Design Audit)

> **Bu belge bir özellik öneri listesi değildir.** OwlHunt'ın **kimliğini oluşturan** temel tasarım kararlarının, önceki araştırma raporunun (`player-engagement-motivation-review.md`) bilimsel kaynaklarıyla eleştirel biçimde sınandığı bir stres testidir.
>
> **Kural:** Sistemi sırf değiştirmesi zor olduğu için savunmuyoruz; sırf eleştiri olsun diye de problem uydurmuyoruz. **Kanıt ne diyorsa onu söylüyoruz.** Kanıt zayıfsa **INSUFFICIENT EVIDENCE** yazılıyor.
>
> **Sürüm:** 2026-09-12 · Kaynak: [player-engagement-motivation-review.md](player-engagement-motivation-review.md) · AUDIT MODE (kod değişikliği yok).

---

## 0. Yöntem

### 0.1 “Temel fikir” filtresi

Her sistem şu testten geçirildi: **“Bu sistem kaldırılırsa, kalan bot hâlâ tanınabilir biçimde OwlHunt mudur?”**

Cevap **hayır** ise → temel. Cevap **evet** ise → yardımcı, bu belgenin kapsamı dışında.

Filtreden geçen 6 sistem + 1 çapraz kısıt (Discord chat UX) seçildi.

### 0.2 Her sistem için sabit blok

`Core Idea → Why We Use It → Relevant Research → Evidence → Strength of Evidence (HIGH/MEDIUM/LOW/INSUFFICIENT) → What Works → What Doesn't → Hidden Problem → Long-Term Effect (early/mid/long) → Verdict (KEEP / KEEP WITH CHANGES / REWORK / QUESTION THE CORE IDEA)`

### 0.3 Kategori ayrımı (Bölüm 5 için)

Her problemli tespit şunlardan biriyle etiketlenir:
- **A.** Temel fikir iyi, uygulaması kötü
- **B.** Temel fikir iyi, ölçeklenmesi kötü
- **C.** Temel fikir iyi, başka sistemle çakışıyor
- **D.** Temel fikir uzun vadede zayıflıyor
- **E.** Temel fikir baştan problemli

### 0.4 Çapraz kısıt: Discord komut UX’i (bir kez, kısa)

OwlHunt Discord’un metin komut arayüzü üzerine kurulu. Bu bir tasarım seçimi değil, **her diğer sistemi biçimlendiren zemin**. Etkileri:

- **Görsel geri bildirim yok** → tek yol, metin + emoji + embed. GameFlow’un “feedback” kriteri kısıtlı bantta çalışmak zorunda (Sweetser & Wyeth, 2005).
- **Kesintili UX** → her komut ayrı bir mesaj; state Discord tarafında persist etmez. Flow’un “concentration” koşulu yerine, oyuncu her komutu manuel olarak yeniden tetiklemek zorunda.
- **Metin komutu = düşük bilişsel yük ama düşük mekanik derinlik** → mastery ceiling doğal olarak sınırlı (Rocket League/StarCraft ölçeğinde ceiling burada mümkün değil).
- **Sosyal katman güçlü** → aynı kanaldaki diğer oyunculara gerçek zamanlı görünürlük; Cole & Griffiths 2007’nin MMORPG relatedness bulgusu Discord bot bağlamında **avantaj**.

Bu kısıt boyunca hatırlanmalı: aşağıdaki sistemlerin kendisi kadar, **Discord’un dar bantında ne kadar iyi ifade edildikleri** de önemli.

---

## 1. Sistem 1 — 7-Saniyelik Hunt Loop + Minimum Garanti

### Core Idea
`/owl hunt` = 7 sn cooldown’lu tekrarlanabilir ana aksiyon. Her hunt: prey rolls → başarı/başarısızlık → XP + drop + potansiyel encounter (tame chance) + potansiyel lootbox drop. Hiç yakalayamazsan sistem **düşük tier bir prey’i garanti eder** (`realCatchCount = 0` ⇒ minimum garanti bloğu, `hunt.ts:367-376`).

### Why We Use It
Botun **beating heart**’ı. Kısa oturum, hızlı feedback, düşük giriş engeli. Discord bağlamında yüksek frekanslı etkileşim tek yol.

### Relevant Research
- Sweetser & Wyeth (2005) **GameFlow** — “clear goals · immediate feedback · concentration” koşulları hızlı loop’ta güçlüdür.
- Ryan, Rigby & Przybylski (2006) — competence sinyali sık ve okunabilir olduğunda intrinsic motivasyon yükselir.
- Locke & Latham (2002) — proximal goal (7 sn cooldown = mikro hedef) sıklığı motive edicidir.
- Deci, Koestner & Ryan (1999) — beklenmedik pozitif sonuç intrinsic motivasyonu güçlendirir; **beklenen** materyal ödül zayıflatır (d ≈ −0.40).
- Loewenstein (1994) — anticipation, boşluk çözülebilir görünürse çalışır; sonuç çok tahmin edilebilir olursa merak ölür.

### Evidence
- Sık + hızlı geri bildirim: **HIGH** — GameFlow, SDT ve flow literatürü ortak.
- Hunt keyfini artıran minimum garanti: **MEDIUM** — “fair” hissi (algılanan adalet) veriyor; ama Loewenstein’a göre **anticipation** üzerinde etkisi belirsiz.
- Streak/pity/level/newbie/retention bonusları hepsi **gizli** → SDT autonomy prensibi ile çelişkili (Tyack & Mekler 2020/2024 yüzeysel SDT uyarısı).

### Strength of Evidence
**HIGH** (loop sıklığı ve feedback için) · **MEDIUM** (auto-guarantee için) · **MEDIUM** (gizli bonusların uzun vadeli etkisi için — deneysel ölçüm ince).

### What Works
- **7 sn tempo** SDT competence + flow feedback kriterini kolay karşılıyor.
- **Combo streak** (3/5 art arda) mikro-goal katmanı; Locke & Latham proximal goal etkisi.
- **Pity bonus** (8 hunt no-rare → devreye giriyor) King, Delfabbro & Griffiths 2010 “reward/punishment features” taxonomisinin **iyi** yüzü: bad-luck koruması.
- **Minimum garanti** oyuncunun “boşa vakit geçirdim” hissini engelliyor.

### What Doesn't
- **Karar yok:** `/owl hunt` yazma dışında oyuncu aksiyonda tercih yapmıyor. Slay the Spire her turdakiyle karşılaştırıldığında → tek boyutlu.
- **Görünmez bonuslar** (streak/pity/newbie/retention/level): SDT’de **competence sinyali görünür olduğunda** işler; gizli bonus sadece “şansım açık gidiyor” hissi verir, oyuncunun **kendisini** iyi hissetmesini sağlamaz.
- **Auto-guarantee ile Loewenstein çelişkisi:** sonucun tahmin edilebilir minimumu var → anticipation eğrisi düz. Merak “belki bugün bir şey olur” yerine “bir şey olacağını biliyorum” haline geliyor.
- **Cooldown’un “ödül” yerine “bekleme cezası” olarak deneyimlenmesi:** oyuncu cooldown mesajını çok tetikliyorsa (kullanıcının şikayeti “hızlı hızlı komut yazınca”) → flow’un “control” kriteri bozuluyor. Şu an auto-delete iyi bir tampon, ama sorun kök nedende değil.

### Hidden Problem
Loop’un **karar boyutu sıfıra yakın**. Oyuncu bir hunt’ın sonucunu değiştirmek için hiçbir şey **seçemiyor**: hangi biome (b0 tek), hangi taktik (yok), hangi owl (main), hangi item (buff pasif). GameFlow’un **control** ve SDT’nin **autonomy** kriterleri tek eksenli. Loop’un derinliği tamamen **arka plan sayısal formülünden** geliyor; oyuncu bunu **hissetmiyor**.

### Long-Term Effect
- **İlk saatler:** Hızlı tempo + görünür XP + drop = yüksek dopamin. Yeni oyuncu için ideal.
- **Orta vade (2–4 hafta):** Auto-guarantee ile anticipation eğrisi düzleşiyor. Bonusların gizliliği competence sinyalini zayıflatıyor. Oyuncu “neyi neyle yapıyorum?” sorusuna cevap alamayınca **rutin** hissi başlıyor.
- **Uzun vade:** Loop çözüldüğünde (bu tür sistem birkaç ay içinde çözülür) meta-goal katmanı olmasaydı oyuncu bırakırdı. Şu an **milestone/quest ile hayatta tutuluyor** — yani intrinsic motivasyon değil, extrinsic scaffolding hunt’ı taşıyor (Deci vd. 1999 undermining sinyali).

### Verdict
**KEEP WITH CHANGES** — kategori **A + D** (uygulaması eksik ve uzun vadede zayıflıyor)

Loop’un çekirdeği doğru; tempo + feedback + pity sağlıklı. Ama **karar ve görünürlük** eksik. En küçük müdahaleler:
- **MINIMAL CHANGE 1:** Streak/pity bonuslarını oyuncuya **açıkça göster** (`Av streak: 5 · +25% catch bonus aktif`). Competence görünür olur, autonomy “ne yapıyorum” hissini kazanır.
- **MINIMAL CHANGE 2:** Auto-guarantee kalksın veya opsiyonel olsun. Gerçek 0 sonuçlu hunt oyuncunun anticipation bant genişliğini geri veriyor. “Boşuna gitti” hissini soft-message ile telafi et (yeni curiosity teaser: “Bir sonrakinde pity +8%”).
- Bunlar dışı için yeni içerik ekleme; **öncelik: mevcut loop’un görünürlüğü**.

---

## 2. Sistem 2 — Owl as Vessel + Moon-Tier Evolution

### Core Idea
Oyuncu bir “main owl” taşır; hunt/tame ile yeni owl’lar edinir, stat’larını yükseltir, moon-tier’ı **otomatik olarak** stat toplamına göre yükselir (`owl-moon-evolution.ts` — `calcOwlStatSumPower` → `resolveMoonTierFromPower`). Prestige sistemi **kaldırılmış** (`owl-prestige.ts:6-16`); uzun vadeli progression şimdi moon-tier evolution + species tier grid.

### Why We Use It
Long-term progression vessel’ı. Oyuncunun “ne inşa ediyorum” cevabı. Species tier (1–8) × moon tier (N) = büyük bir progression grid.

### Relevant Research
- Ryan vd. (2006) — competence + autonomy oyunlarda intrinsic motivasyonun ana taşıyıcıları.
- Locke & Latham (2002) — distal hedef (yüksek moon tier) proximal hedeflerle (her hunt XP) desteklenirse etkilidir.
- Deci & Ryan (2020) — **beceri unlock** anlamlı ise competence beslenir; salt sayı artışı **sahte competence**.
- Cole & Griffiths (2007) — MMO’da uzun-vadeli progression, sosyal görünürlükle birleştiğinde retention’ı en güçlü yordayan faktörlerden.

### Evidence
- Long-term vessel → **HIGH** (SDT competence + long-term progression).
- **Ancak** OwlHunt’ta evolution **otomatik**: oyuncu evrimi tetikleyecek bir seçim yapmıyor. Sadece hunt yaparsan stat büyür, moon tier büyür.
- Trait sistemi (rollTraits, resolveTraits) var, ama trait dropu **tame anında rastgele**; oyuncu **build tercihi** yapmıyor.

### Strength of Evidence
**MEDIUM** — vessel fikri güçlü; **ancak** SDT autonomy ekseni yok.

### What Works
- Species tier (1–8) + moon tier zengin bir grid, prey-dex ile birleştiğinde curiosity motoru için iyi zemin.
- Owl’un **kişileştirilebilirliği** (isim, nickname) relatedness proxy’si (bağlanılan nesne).
- Bond mekaniği (BOND_GAIN_PER_HUNT 0.5, PER_TAME 5, PER_PVP_WIN 2) SDT’ye uyar: sık ve küçük artışlar competence görünürlüğü.

### What Doesn't
- **Autonomy sıfır:** oyuncu build seçmiyor, evolution seçmiyor, path seçmiyor. Elden Ring/BG3 karşılaştırması bile gerekmez — Discord bot ölçeğinde bile *Idle games* daha çok build seçtirir.
- **Prestige kaldırılmış** ama yerine gelen bir **meta-progression** yok. Rogue-lite meta-progression modeli (Hades, Dead Cells) uzun-vade için literatür standardı; şu an bunun yerini moon-tier gridi tek başına doldurmaya çalışıyor.
- Trait sistemi var ama **oyuncuya seçim vermeden** rastgele düşüyor. King, Delfabbro & Griffiths (2010) “manipulation and control features” kriterinde control düşük.

### Hidden Problem
**Owl bir vessel, ama oyuncu owl’un tasarımına katkı yapmıyor.** Hunt otomatik XP verir, XP otomatik level verir, level otomatik moon tier verir. Tüm progression **pasif akış**. Bu, tamamıyla **operant conditioning** loop’udur — Ryan/Deci’nin *controlled motivation* dediği tarafta. Oyuncu “yaptım” demek yerine “oldu” diyor.

### Long-Term Effect
- **İlk saatler:** Tame + level-up + moon tier atlama = güçlü early competence. İyi çalışıyor.
- **Orta vade:** İkinci owl, üçüncü owl … main dışındakiler pasif kalıyor (`passiveMode: 'scouting'/'training'`). Discovery: “ah bu owl aslında sadece bir sayı bloğu”. Sahte-collection algısı.
- **Uzun vade:** Prestige olmadan, moon tier ceiling’i tükenince ne olacak? Rogue-lite meta-progression modeli olsaydı burada devreye girerdi. Şu an **INSUFFICIENT EVIDENCE** — sistemin endgame’i henüz test edilmemiş.

### Verdict
**KEEP WITH CHANGES** — kategori **A + D**

Vessel fikri güçlü, ama **autonomy** eklenmezse uzun vadede sıkılma kesin. En küçük müdahaleler:
- **MINIMAL CHANGE 1:** Trait sisteminde tame anında **oyuncuya küçük bir seçim** (üç trait öner, birini seç). Karar boyutunu sıfırdan bire çıkarır.
- **MINIMAL CHANGE 2:** Level-up’ta bir tercih (stat allocation puanı, veya küçük dallanma). SDT autonomy sinyali güçlü olur. Slay the Spire modeli — her N level bir “kart seç”.
- Prestige’in yerine gelecek meta-progression için ayrı bir tasarım tartışması (bu belgenin kapsamı dışı).

---

## 3. Sistem 3 — RNG Rarity + Pity Anticipation Engine

### Core Idea
Her hunt/encounter/PvP’de **düşük olasılıklı** ödüller (lootbox %5/%12, tame nadir prey, God Roll owl). Görünmez pity mekanizmaları (hunt: `noRareStreak ≥ 8` → +4%/hunt bonus, max +30%). Günlük 10 lootbox soft-cap (`drops.ts:DAILY_DROP_CAP = 10`).

### Why We Use It
Anticipation motoru. Schultz’un reward prediction error’unu doğrudan besliyor.

### Relevant Research
- Schultz, Dayan & Montague (1997) — dopaminerjik yanıt **beklenenden farklı** ödüle verilir; VR ödül **anticipation** kaynağı.
- King, Delfabbro & Griffiths (2010) — “reward and punishment features” taxonomisi: pity gibi bad-luck koruması **yapısal risk faktörü değil**, aksine bir tampondur; gizli olması ise **manipulation** kategorisine yaklaşır.
- Deci, Koestner & Ryan (1999) — beklenmedik / bilgilendirici ödül intrinsic motivasyonu **artırır**; beklenen materyal ödül **zayıflatır**.
- Loewenstein (1994) — anticipation, boşluğun çözülebilirliği görünürse çalışır.

### Evidence
- VR ödül güçlü motive edicidir: **HIGH**.
- Pity sistemi doğru tasarım prensibidir: **HIGH**.
- **Pity’nin görünür olması gerekir** — mevcut uygulamada görünmez: **INSUFFICIENT** deneysel kanıt (görünür pity vs gizli pity karşılaştıran güçlü çalışma az), ama SDT’nin autonomy prensibi ile **çelişki** yönünde teorik güç: HIGH.

### Strength of Evidence
**HIGH** (VR + pity varlığı için) · **MEDIUM/HIGH** (gizlilik sorunu için, teorik + Tyack & Mekler 2024 “paradigma yüzeysel” çerçevesi).

### What Works
- **VR yapı**: %5–%12 lootbox drop chance + kritik hunt çarpanı (2×) + günlük cap → cömert base + nadir spike prensibiyle (rapor RW-1) uyumlu.
- **Pity mekanizması var** ve **niyet** doğru — kullanıcı şikayeti (“10 elde 1 kere kazanamadım”) buna doğrudan cevap. Frommel & Mandryk 2022 gibi cömertlik tasarımıyla uyumlu.
- **Günlük 10 lootbox cap** anti-farm koruması, oyuncunun kendini tükenmişliğe zorlamaması için.

### What Doesn't
- **Pity görünmez.** Oyuncu bad-luck korumasının varlığını **hissetmiyor**. Adalet algısı için var, ama iletmediği için amacına ulaşmıyor.
- **Level softcap** (level ≥ 20 → drop chance −%1/level, max −%30) da **görünmez**. Deneyimli oyuncu drop rate’in düştüğünü fark ediyor ama nedenini bilmiyor → **haksızlık algısı**.
- **Kullanıcı şikayeti direkt kanıt:** bir oyuncu “10 elde 1 kere bile kazanamadım (bilerek kazandırma lazım)” dedi. Bu bir **algı** problemidir; sistem adaletli çalışıyor olabilir ama iletişim yok. Tam bir TR-3 (rapor transparency prensibi) ihlali.
- Rarity kategorileri (Trash/Common/Good/Rare/Elite/God Roll) tame’de sistemin kendisinde var, ama oyuncuya **kalite hedefi** olarak sunulmuyor.

### Hidden Problem
**Sistem adalete uygun ama adaleti iletemiyor.** Klasik “sinsi iyi tasarım” tuzağı: mühendislik doğru, UX yanlış. Sonuç: oyuncu adalet var sanıyor değil, **manipülasyon var** sanıyor. Bu güven kaybı en zor telafi edilenlerden.

### Long-Term Effect
- **İlk saatler:** Rare drop = büyük dopamin. Newbie luck bonus (`getNewbieLuckBonus`) da yardım ediyor.
- **Orta vade:** Level softcap ile drop “yavaşlıyor gibi” geliyor. Şeffaflık yoksa güven azalır. Kullanıcı şikayeti tam bu kırılım noktasında.
- **Uzun vade:** Endgame’de VR pattern çözülür (oyuncu artık expected value hesabı yapar); sadece meaningful new content (yeni species, yeni evolution unlock, yeni biome) taze tutabilir.

### Verdict
**KEEP WITH CHANGES** — kategori **A** (uygulaması eksik)

Sistemin kendisi bilimsel olarak sağlam. Sorun tamamen **iletişim**de:
- **MINIMAL CHANGE 1:** Pity sayacını UI’da göster: `Nadir olmayan 6/8 hunt · pity yakında`. Rapor RW-3, TR-1.
- **MINIMAL CHANGE 2:** Drop oranlarını `/owl help drops` içinde açıkla; level softcap’i de gizleme. Şeffaflık algılanan adaleti onarıyor (rapor TR-3).
- **MINIMAL CHANGE 3:** Kritik/rare drop olduğunda küçük “Rare!” bilgilendirme + cümle → competence sinyali güçlensin (Ryan vd. 2006 informational feedback → intrinsic +).

---

## 4. Sistem 4 — Player Economy: Trade + Market + **Daily Maintenance Cost**

### Core Idea
- **Trade** (P2P escrow — item/owl/coin, ready lock, dual confirm).
- **Market** (%5 tax + %1 listing fee + 48h duration + 5 max active listings).
- **Auto-sink** (fazla item → 3 coin + 1 XP).
- **Daily Maintenance** (`economy.ts:dailyMaintenance` — her gün 1 `Cig Et` yoksa main owl `effectiveness -= 5`).

### Why We Use It
Ekonomik derinlik + relatedness (trade) + coin drain (market fee/tax + maintenance) + oyuncu-tanımlı fiyat.

### Relevant Research
- Cole & Griffiths (2007) — trade sosyal etkileşimin bir formu, oynama keyfinin büyük bir bileşeni.
- Ryan, Rigby & Przybylski (2006) — autonomy: kendi tercihleriyle piyasada işlem yapmak SDT’nin autonomy ihtiyacı.
- Frommel & Mandryk (2022) — **daily reward’ın karanlık tarafı**: zorunluluk hissi, chore, stres, FOMO.
- Deci & Ryan (2020) — **external regulation** (ödemezsen cezalandırılırsın) intrinsic motivasyonu aşındırır.
- Bäcklund vd. (2022) — emotional escape motivasyonu problem gaming ile en güçlü ilişkiye sahip. Zorunluluk hissi yaratan mekanikler bu motivasyonu besler.
- Kahneman & Tversky loss-aversion literatürü (prospect theory çerçevesi; rapor doğrudan atıflı değil ama iyi bilinen).

### Evidence
- Trade/market’in relatedness + autonomy faydası: **HIGH** (Cole & Griffiths + SDT).
- Daily maintenance-as-punishment’ın external regulation etkisi: **HIGH** (Deci/Ryan/Frommel & Mandryk).

### Strength of Evidence
**HIGH**.

### What Works
- Trade sistemi (escrow, ready lock, dual confirm) **teknik olarak** güvenli ve sosyal katmana sağlıklı zemin.
- Market fee/tax = ekonomik denge için gerekli sink. %5 tax + %1 listing = makul, adil algı destekli.
- Auto-sink oyuncunun envanteri patlamadan “boşta” değer dönüşü sağlıyor.

### What Doesn't
- **Daily maintenance (1 çiğ et yoksa −5 effectiveness) tam bir loss-aversion trap**. Frommel & Mandryk 2022’nin “obligation / chore” patternini birebir üretir. Bu mekaniğin kanıtı zayıf, riski büyük.
- **“Ceza” yapısı:** oyuncu login etmeyi başarmazsa **oyunun içindeki gücünü kaybediyor**. Bu, SDT’nin **external regulation** (dışsal baskı) kategorisidir. Ryan & Deci 2020: bu tür motivasyon **keyfi aşındırır**.
- Kayıp kalıcı mı, telafi edilebilir mi (buff item ile? XP ile?) — kodda tek yönlü düşüş görünüyor. Long-term’de effectiveness çok düşerse oyuncu **regressif** hisseder → competence yıkılır.
- Market’te fiyat sinyali yok (yeni oyuncu piyasa değerini bilmez) → autonomy sahte olabilir (Tyack & Mekler 2024 illüzyon-seçim eleştirisi).

### Hidden Problem
**Daily maintenance sisteminin varlığı botun genel “grace-friendly” duruşuyla çelişiyor.** Hunt milestone silent reset (kullanıcı isteğiyle bilinçli olarak grace-friendly yapıldı) ile aynı botta **maintenance ceza modeli** paralel çalışıyor. Bu iç tutarsızlık, oyuncunun beklentisini bulanıklaştırır: bot “iyi bot” mu, “zaman ceza botu” mu?

### Long-Term Effect
- **İlk saatler:** Yeni oyuncu maintenance’ı fark bile etmez (envanterde çok yem var).
- **Orta vade:** Bir gün oyunu bıraktıktan sonra dönüp effectiveness kaybını görmek — motivasyon vurucu. Extrinsic pressure’a kayış.
- **Uzun vade:** Kalıcı effectiveness kaybı **competence** hissini yıkar. Oyuncu “ceza sistemine hizmet ediyorum” hissiyle bırakır (Frommel & Mandryk 2022 “chore” patterni).

### Verdict
- **Trade + Market:** **KEEP** (kategori: fikir güçlü, uygulama sağlam; şeffaflık düzeltmeleri opsiyonel — bkz. RW/TR prensipleri).
- **Daily Maintenance:** **REWORK** — kategori **E** (temel fikir baştan problemli)

Maintenance-as-punishment botun genel felsefesiyle çelişiyor ve bilimsel olarak zayıf. **Alternatif tasarım prensibi:** ceza yerine bonus:
- **MINIMAL CHANGE:** Çiğ Et harcanırsa **+bonus** (küçük buff, daha hızlı stamina rejen); harcanmazsa **hiçbir şey olmaz** (nötr baseline). Aynı ekonomik sink, ama motivational çerçeve pozitif. Deci/Ryan “informational reward” prensibiyle uyumlu.
- Bu değişiklik uzun vadede oyuncu güvenini onarır ve grace-friendly duruşla tutarlı hale gelir.

---

## 5. Sistem 5 — Coin Gambling Minigames + Streak Modifier

### Core Idea
- Coinflip: **%49 win chance × 1.95 payout** = **95.55% RTP** (net EV ≈ −4.5%).
- Blackjack, PvP-gambling, duelbet: benzer negatif EV mekaniği (house cut).
- **Streak modifier (`gambling.ts:streakModifier`):** 3 win → chance −2%, 5 win → −5%; 3 loss → +3%, 5 loss → +5% (self-correcting rubber-band).
- Retention bonus da eklenir (`getGambleRetentionBonusSafe`).

### Why We Use It
Ekonomiye coin drain, oyuncular arası risk-reward eğlencesi, alt gameplay loop.

### Relevant Research
- King, Delfabbro & Griffiths (2010) — “reward and punishment features” içinde slot/gambling-benzeri mekanikler yapısal risk faktörü olarak listeleniyor.
- Bäcklund vd. (2022) — **emotional escape** motivasyonu problem gaming ile en güçlü ilişkiye sahip; kumar dinamiği bu motivasyona doğrudan hitap eder.
- Loot box literatürü (King & Delfabbro serisinin devamı) → oyun-içi kumar mekaniklerinin problemli gaming semptomlarıyla korelasyonu belgelenmiş.
- Deci & Ryan (2020) — **rubber-band** dinamikleri autonomy + competence yıkımına yol açar (rekabet oyunlarında DDA meta-analizleri, Mortazavi vd. 2024).
- Ryan, Rigby & Przybylski (2006) — algılanan adalet SDT’nin autonomy zemininde şart.

### Evidence
- Negatif EV = uzun vadede oyuncu kaybeder: **HIGH** (matematiksel + davranışsal).
- Rubber-band (gizli streak dampener) → **algılanan adalet yıkımı**: **MEDIUM/HIGH** (DDA literatürü ile analojik; direkt gambling’de deneysel ölçüm ince).
- Oyun-içi coin ile bile olsa VR + streak dampener + gizli oran, dark pattern **sınır**ına yaklaşıyor: **MEDIUM** (para karışmıyor → tam kumar değil; ama mekanik iskelet aynı).

### Strength of Evidence
**HIGH** (matematiksel olarak); **MEDIUM/HIGH** (davranışsal ve algısal etkilerde).

### What Works
- Kumar minigames coin ekonomisine sağlıklı bir **sink** sağlıyor (aksi halde coin enflasyonu).
- Streak modifier’ın **niyeti** doğru: kayıp seride oyuncuyu kaybettirici bir spirale bırakmama.
- Coin-only (gerçek para karışmıyor) — bu **kritik doğru karar**. Rapor RW-4/M4/X1 sınırı burada tutulmuş.

### What Doesn't
- **Streak modifier gizli.** Oyuncu win oranının kendisinden bağımsız olarak değiştiğini bilmiyor. Kazandıkça “bir şey ters gitmeye başlıyor” hisseder; kaybettikçe “nihayet döndü” hisseder. Bu **rubber-band pattern**; DDA literatüründe rekabetçi ortamlar için autonomy + competence yıkıcı olarak belgelenmiş (Mortazavi vd. 2024).
- Kullanıcı şikayeti (“10 elde 1 kere bile kazanamadım”) tam bu **rubber-band + gizlilik** kombinasyonunun ürettiği hissi işaretliyor. Oyuncu sistemin adil olmadığını **doğru sezdi** — sistem gerçekten kendisinden bağımsız modifiye ediyor.
- **Retention bonusu** aynı mekaniğe daha ekleniyor: kaybeden oyuncuya “gel geri, +% şansın var” yani **arka planda oyuncuyu iyi hissettirmeye çalışma**. Bu **paternalist** bir tasarım; Ryan/Deci autonomy prensibiyle doğrudan çelişir.
- **Negatif EV + gizli dampener + retention bonus** üçlüsü, tek başına olsa masum sayılabilecek her parçayı tehlikeli hale getiriyor.

### Hidden Problem
**Sistem, oyuncunun duygusal durumunu kendisi bilmeden yönetmeye çalışıyor.** Bu, teknik olarak sofistike ama etik olarak **paternalist**. Ryan/Deci’nin autonomy tanımı: “aksiyonun kendisinden kaynaklandığı hissi.” Rubber-band + retention bonus, oyuncunun deneyimini **onun onayı olmadan** biçimlendiriyor. Bu, dark pattern sınırının **iç tarafından** çalışıyor gibi görünse de, algılanan adalet çöktüğü anda oyuncunun güveni yıkılır.

### Long-Term Effect
- **İlk saatler:** Streak modifier henüz devrede değil; oyuncu VR keyfi yaşıyor.
- **Orta vade:** 5 win/5 loss serileri geliyor; modifier devreye giriyor. Bilinçli oyuncu ampirik olarak “bir şey oluyor” fark eder. Şüphe başlar.
- **Uzun vade:** Bäcklund vd. (2022) escape motivasyonu ile kumar’ın ilişkisi + rubber-band’in güven yıkımı → **hem** oynayan oyuncu için sağlıksız hem de bırakan oyuncu için “bot sahtekar” izlenimi.

### Verdict
**REWORK** — kategori **A + E**

Kumar minigame’in **fikri** ekonomik sink olarak defandır edilebilir (kategori A). **Streak modifier + retention bonus’un mekaniği** ise baştan problemli (kategori E). En küçük müdahaleler:

- **MINIMAL CHANGE 1 (en önemli):** Streak modifier’ı **kaldır** veya **görünür yap**. “Şanslı seri” diye bir şey yoksa (ki matematiksel olarak yoktur), sisteme yalan söyletmemek gerek. Görünür yapılırsa: “kazanç serindesin, sistemin şans dengeleyicisi aktif” — bilgilendirici. Kaldırılırsa: gerçek VR + gerçek EV. Her ikisi de mevcuttan iyi.
- **MINIMAL CHANGE 2:** Coinflip RTP’sini artır ya da azalt — ama **oyuncuya göster** (“%49 kazanma × 1.95 ödeme = %95.55 dönüş, uzun vadede %5 kaybedersin ortalama”). Kumarın tanımı gereği RTP < 1 olur; **oyuncunun bunu bilerek oynaması** etik farkın kendisidir.
- **MINIMAL CHANGE 3:** Retention bonusunu bu kanaldan çekin. Retention için tasarlanmış özel dark pattern niyet iyi olsa bile yanlış.

Tercih edilirse **daha büyük soru:** Kumar minigames coin sink olarak gerçekten en iyi çözüm mü? Alternatif sink’ler (item crafting, cosmetic, guild upgrade) daha az risk taşır. Bu **kategori E** sorusu — kapsamı bu belgenin dışında ama açıkça sormak gerek.

---

## 6. Sistem 6 — Meta-goal Scaffolding: Login Streak + Daily Quests + Hunt Milestones

### Core Idea
Üç paralel extrinsic hedef katmanı:
- **Daily login streak** (`daily-login.ts`): 30 sa cooldown, 24 sa grace, 200 → 800 coin, milestone bonusları, her N gün lootbox.
- **Daily quests** (`daily-quests.ts`, `daily-quest-pool.ts`): günlük quest havuzundan seçilen görevler.
- **Hunt milestones** (yeni, `hunt-milestones.ts`): 25 → 50 → 80 → 115 … kilometre taşları, XP + lootbox, 24s inaktivitede sessiz reset.

### Why We Use It
İntrinsic hunt loop’un üstüne extrinsic hedef katmanı — geri dönüş + günlük hedef + haftalık progress hissi.

### Relevant Research
- Locke & Latham (2002) — spesifik + zor-ama-ulaşılabilir hedefler motivasyonu güvenilir artırır.
- Frommel & Mandryk (2022) — daily quest / login reward’lar bir alt grup için **motivasyon**, diğer alt grup için **stres, zorunluluk, chore**. İkili doğa.
- Deci, Koestner & Ryan (1999) — beklenen tangible ödül, zaten ilgi duyan oyuncuda intrinsic motivasyonu **azaltır** (undermining, d ≈ −0.40).
- Ryan & Deci (2020) — external regulation vs identified regulation ayrımı: beklenti tangible ödülle bağlı ise external.
- Sailer vd. (2017) — gamification öğelerinin motive edici etkisi **hangi öğe hangi ihtiyacı besliyor** ile değişiyor; sadece “ekle” yeterli değil.

### Evidence
- Goal-setting temel prensip olarak **HIGH** güçte kanıtlı.
- Ancak **çoklu paralel katmanın** cumulative etkisi ve **overjustification** riski **HIGH**.
- Şu ana kadar OwlHunt’ta bunun etkisini ölçen veri yok: **INSUFFICIENT** empirical evidence, teorik risk yüksek.

### Strength of Evidence
**HIGH** (temel goal-setting için) · **MEDIUM/HIGH** (çoklu katman + undermining riski için).

### What Works
- **Hunt milestone silent reset** (yeni) — Frommel & Mandryk 2022’nin “kaçırma cezasını azaltma” önerisiyle **birebir uyumlu**. Bu proje içindeki en sağlıklı design kararlarından.
- **Daily login 30sa + 24sa grace** cömert — 2+ gün pencere, healthy retention prensibiyle uyumlu.
- Daily quest havuzunun rotasyonu — novelty ekseninde küçük ama gerçek.

### What Doesn't
- **Üç sistem paralel çalışıyor.** Her biri kendi başına makul, ama toplamda oyuncuya **üç ayrı checklist** sunuyor: login streak, günlük quest, milestone yaklaşımı. Rapor GO-2: aktif quest limitini denetle. Şu an denetimi bir katmandaydı — bütünde değil.
- **Login streak coin ödülü büyüdükçe (200 → 800)** external regulation güçlenir. Deci/Ryan 2020: “ödeme ne kadar bekleniyorsa, o kadar undermining”.
- **Milestone ödülü tetikleyici olarak hunt’ı yönlendirebilir** — oyuncu hunt’ı **milestone için** yapmaya başlarsa, hunt’ın kendi keyfi zayıflar (Deci vd. 1999, d ≈ −0.40 undermining).
- Katmanlar arası bilgi akışı yok: quest tamamlama milestone’a katkı sağlıyor mu? Login streak quest’i etkiliyor mu? UI bunu göstermiyor → oyuncu her katmanı ayrı takip ediyor.

### Hidden Problem
**Üç katmanın toplam extrinsic yükü hesaplanmamış.** Locke & Latham hedefler için “spesifik” diyor ama **kaç tane spesifik hedef**? Bir katman katman büyüyor ama toplamda oyuncunun günlük gerçek “yapılacak” listesi ne kadar uzuyor? Rapor GO-2 (quest fatigue uyarısı) tam bu noktada geçerli.

### Long-Term Effect
- **İlk saatler:** Tüm katmanlar aynı anda cömert. Yeni oyuncu için pozitif.
- **Orta vade:** Katmanların bağımlılığı artar (milestone almak için 50 hunt lazım → login streak’i tutmak lazım → günlük quest de yaparsam ekstra XP). Oyuncu **rutin** hissini başlar. Bu, Frommel & Mandryk 2022’nin “chore” patterni.
- **Uzun vade:** Extrinsic scaffolding hunt’ın kendi keyfini **çekerse**, oyuncu bir gün ödül değeri düşünce (endgame, prestige kaldırıldığı için doğal bir dönüş yok) bırakabilir. Klasik “ödül tükendiği için oyun tükendi” patterni.

### Verdict
**KEEP WITH CHANGES** — kategori **B + C** (ölçeklenmesi + iç çakışması)

Her katmanın kendisi doğru; **birlikte çalıştıklarında** yük hesaplaması yok. En küçük müdahaleler:

- **MINIMAL CHANGE 1:** Katmanlar için tek bir “bugünkü tablo” — oyuncu 3 ayrı yerden okumasın; birleşik görünüm quest fatigue’i azaltır. Aynı görevler, farklı sunum.
- **MINIMAL CHANGE 2:** Login streak ödülünü **büyütmek yerine değişkenleştir** (rotate coin ↔ item ↔ küçük cosmetic). Beklenen tangible ödülün undermining etkisini yumuşatır (Deci vd. 1999).
- **MINIMAL CHANGE 3:** Hunt milestone XP eğrisini metrikle kalibre et (rapor C5). Milestone ödülü baz hunt XP’sinin ~1–2× üzerine çıkmasın.
- **MINIMAL CHANGE 4:** Hedefe yaklaşma göstergesi (rapor A2) — cezasız, teaser dili. Anticipation Locke/Latham’a katkı, chore hissini karşı-dengeler.

---

## 7. Çapraz Sistem Analizi — Sistemler Birbirini Nasıl Etkiliyor?

Tek tek sistemleri incelemek yetmez; **bileşke etkisi** genellikle kritik.

### 7.1 Ana çapraz döngü: Hunt + Rarity + Economy + Progression

```
[Hunt (7s)]  ──► [Prey + XP]  ──► [Level] ──► [Owl stat] ──► [Moon tier]
     │                 │                                              ▲
     │                 └──► [Sell coin] ──► [Market/Gambling] ──┐    │
     │                                                          │    │
     └──► [RNG: lootbox / rare / drop] ──► [Item stack] ──► [Buff / Trade] 
                                                                       │
                              [Meta-goals: login+quest+milestone] ─────┘
```

- **Motivation kaynakları:** hunt loop (competence + flow), rarity (anticipation), moon tier (long-term), trade (relatedness), meta-goals (goal-setting).
- **Yapı bütün olarak çalışıyor mu?** Kısmen. Autonomy ekseni **çok zayıf** (bkz. Sistem 1 & 2). Curiosity ekseni **kısıtlı** (biome tek, evolution otomatik, mystery yok). Diğer eksenler yeterli-güçlü.
- **Kritik kırılma noktası:** oyuncu loop’u çözdüğünde (birkaç hafta içinde) hangi eksen hayatta tutuyor? Şu an **meta-goals + rarity dopamin + trade relatedness**. Autonomy + curiosity + deep mastery **yok**. Bu, uzun vadede kırılgan bir portföy — üç bacaklı sandalye.

### 7.2 Çakışma noktaları

**Ç1. Gambling ↔ Hunt:** Kumar coin sink’i hunt output’unu tüketir. Oyuncu **hunt yaptığını gambling’de kaybediyorsa** competence sinyali zayıflar. Şu an gambling’in negatif EV + streak modifier’ı hunt’ın verdiği ödülün psikolojik değerini de aşındırır.

**Ç2. Daily maintenance ↔ Grace-friendly milestone:** İç felsefe çelişkisi. Milestone silent-reset ile oyuncuya “ara verebilirsin” diyoruz; maintenance ile “vermezsen effectiveness kaybedersin” diyoruz. Oyuncu iki mesajı **birlikte** duyar. **Kategori C** (sistemler birbirine ters).

**Ç3. Login streak ↔ Daily quests ↔ Hunt milestone:** Üç ayrı ödül tablosu, aynı temel motivasyon üzerinde rekabet ediyor. Herhangi biri baskın çıkmıyor; ama toplamları quest fatigue’e (Frommel & Mandryk 2022) sürüklüyor.

**Ç4. Gizli bonuslar (hunt streak + pity + retention + newbie luck) ↔ Autonomy:** Sistem çok yerde oyuncuyu **kendisinden bağımsız** iyileştiriyor. Niyet iyi; SDT autonomy prensibiyle çakışıyor. Oyuncu iyi hissetmek yerine “oldu” hissediyor.

**Ç5. Auto-guarantee (hunt) ↔ Curiosity/anticipation:** Hunt’ın “hiç mi hiç boş dönmüyorsun” garantisi, gambling’in “sıfır coin dönebilirsin” gerçekliğiyle çelişir. Oyuncu iki tarafın da tutarlı olmasını bekler; hunt “ödül var”, gambling “ödül yok” — psikolojik olarak farklı vaat.

### 7.3 “Oyuncu botu çözdüğünde ne kalır?” senaryosu

**Varsayım:** Deneyimli bir oyuncu 3–4 hafta içinde formülleri (drop rate ~%12, level softcap −%30, prey difficulty band’i, tame chance formülü, coinflip EV −4.5%) empirik olarak çözer.

**Ne kalır:**
- **Kalır:** meta-goals (login streak, milestone, quest) → **extrinsic** kalıntı.
- **Kalır:** trade + market → **relatedness** kalıntı.
- **Zayıflar:** hunt loop’un anticipation’ı (formül çözüldü).
- **Yıkılır:** RNG şeffafsız olduğu için — güven yıkımı.
- **Yok:** moon tier’ın kendisi bir hedef; ama unlock etmek için farklı **oynamak** gerekmiyor → yalnızca daha çok hunt yap. Bu da **grinding**.

**Sonuç:** Bot şu anki formuyla oyuncu-çözdüğünde iki bacağı zayıflıyor (hunt, RNG anticipation), üç bacak (meta-goal, trade, moon tier as time-sink) hayatta tutuyor. Bu, uzun vadede **sürdürülebilir değil** — bir oyuncu meta-goal’un kendisini de bir noktada çözer, trade’in kendi ekonomisi de dominant meta’ya oturur.

**Kanıt derinliği:** MEDIUM. Rapor genel patternleri destekliyor; OwlHunt-spesifik longitudinal veri yok.

---

## 8. BOT CORE DESIGN AUDIT (10 soru)

### 1. Botun en güçlü temel fikri hangisi?

**Hunt loop’un tempo + feedback + pity üçlüsü**. GameFlow (Sweetser & Wyeth 2005) + SDT competence (Ryan vd. 2006) + reward-learning (Schultz vd. 1997) üçünü aynı anda karşılıyor. 7 sn cooldown Discord bağlamında ideal. Auto-guarantee tartışmalı (bkz. Sistem 1) ama loop’un çekirdeği doğru inşa edilmiş.

### 2. En zayıf temel fikir hangisi?

**Daily maintenance (1 çiğ et yoksa −5 effectiveness).** Loss-aversion / external regulation textbook örneği; Deci/Ryan/Frommel & Mandryk üçlüsü aynı yönde uyarır. Botun genel grace-friendly duruşuyla çelişir (kategori **E**).

### 3. En büyük uzun vadeli engagement riski nedir?

**Autonomy eksikliği + extrinsic scaffolding’in intrinsic loop’u undermine etmesi.** Oyuncu (a) hunt’ta karar vermiyor, (b) evolution seçmiyor, (c) trait seçmiyor, (d) build seçmiyor. Aynı zamanda üç paralel meta-goal katmanı hunt’ın kendi keyfini extrinsic ödüle bağımlı hale getirebilir (Deci vd. 1999 undermining, d ≈ −0.40). Bu kombinasyon uzun vadede intrinsic motivasyonu **erozyon**a uğratır.

### 4. Botun oyuncunun geri dönmesini sağlayacak gerçek bir reason-to-return mekanizması var mı?

**Kısmen.** Hunt milestone (silent reset), daily login (24s grace), daily quest — üçü de **extrinsic** taşıyıcı. Sağlıklı intrinsic reason-to-return şu an: **relatedness** (guild + trade). Ama guild sistemi sınırlı (`guild-lifecycle.ts` 198 satır, kolektif hedef yok). **Sonuç:** teknik olarak var, ama karışım büyük ölçüde extrinsic; healthy retention için Bäcklund vd. 2022’nin uyardığı escape motivasyonu yerine mastery/social motivasyonlar merkezde olmalı.

### 5. Oyuncuya mastery hissi verecek gerçek bir sistem var mı?

**Sınırlı.** Level + moon tier = sayısal büyüme. Ama oyuncunun **daha iyi oynadığı** için değil, **daha çok hunt yaptığı** için büyüme = sahte competence (rapor CO-2/CO-4 uyarısı; “power creep without mastery”). Gerçek mastery için beceri kararı gerekli (tame’de var — kısmen); hunt’ta yok. **Kategori D + A**.

### 6. Oyuncunun autonomy hissi yeterli mi?

**Hayır.** Discord komut arayüzü zaten dar bir seçim yüzeyi sunuyor; hunt tek yol (biome b0), evolution otomatik, trait rastgele, build yok. Trade + market autonomy ekseninde tek gerçek katkı. Rapor AN-1/AN-2/AN-4 prensipleri kısmen boşta.

### 7. Progression gerçekten anlamlı mı, yoksa sadece sayıların büyümesi mi?

**Karışık.** Level-up bazı özellikler açıyor (feature min level, tier unlock level, biome level). Bu **functional progression** = iyi. Ama level-up’ın kendisi tek bir eksende (XP → seviye → sayı büyümesi). Anlamlı seçim eklenmediği sürece “sadece sayı” tarafı baskın çıkma eğiliminde. **Kategori A + B** (uygulama eksik, ölçeklenmesi zayıf).

### 8. Reward sistemi davranışı güçlendiriyor mu?

**Evet, ama iki uyarı ile.**
- Pity + VR + kritik çarpanı sağlıklı VR yapısı (Schultz vd. 1997 + rapor RW-1/2).
- **Ama:** gizli bonuslar (pity, softcap, streak dampener) ödülün **oyuncunun aksiyonundan** kaynaklandığını hissettirmiyor. Deci/Ryan 2020: informational reward (bilgilendirici) > tangible reward. Şeffaflık ekleyene kadar reward sistemi kendinden daha zayıf çalışıyor.

### 9. Oyuncunun botu çözmesi durumunda hâlâ oynama nedeni kalıyor mu?

**Zayıf.** Çapraz analiz (§7.3): hunt anticipation çözülür, RNG şeffafsız güveni yıkabilir; kalan bacaklar meta-goal + trade + time-sink. Trade’in sosyal boyutu güçlü bir çıkış (Cole & Griffiths 2007), ama guild sistemi bunun altını tam desteklemiyor. **Sonuç: kırılgan.**

### 10. Botun uzun vadeli gameplay loop’u gerçekten sürdürülebilir mi?

**Şartlı.** Mevcut haliyle **INSUFFICIENT** empirical evidence (uzun vadeli oyuncu davranışı ölçülmemiş), ama teorik risk **yüksek**. Sürdürülebilirlik için üç şey gerekli:
1. Autonomy ekseninin güçlenmesi (build/trait/path kararları)
2. RNG şeffaflığı (algılanan adalet)
3. Extrinsic scaffolding’in intrinsic loop’u undermine etmediğinin ölçülmesi (metrik gerekli)

Bu üçü olmadan bot 2–3 ay öncelikli oyuncu döngüsü sonrası retention’ı kaybedebilir. **Aşağıda P1 dediklerimiz aciliyet buradan.**

---

## 9. ÖZET TABLO

| # | Core System | Evidence | Strength | Main Problem | Long-Term Risk | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 7s Hunt Loop + Auto-Guarantee | GameFlow, SDT, RPE | **HIGH** | Karar yok; gizli bonuslar autonomy vermez | Rutin/monotonluk | KEEP WITH CHANGES (A+D) |
| 2 | Owl Vessel + Moon Evolution | SDT, goal-setting, Cole&Griffiths | **MEDIUM** | Autonomy sıfır; otomatik evolution | Sahte competence | KEEP WITH CHANGES (A+D) |
| 3 | RNG Rarity + Gizli Pity | Schultz RPE, King&Delfabbro, SDT | **HIGH** | Pity + softcap gizli → algılanan adalet yıkımı | Güven erozyonu | KEEP WITH CHANGES (A) |
| 4a | Trade + Market | Cole&Griffiths, SDT | **HIGH** | Fiyat sinyali yok (yeni oyuncu kandırılabilir) | Dominant meta oluşumu | KEEP |
| 4b | Daily Maintenance (−5 effectiveness) | Deci/Ryan, Frommel&Mandryk | **HIGH** | Loss-aversion / external regulation | Chore hissi + churn | **REWORK (E)** |
| 5 | Coin Gambling + Streak Modifier | King&Delfabbro, Bäcklund, DDA meta, SDT | **HIGH** | Gizli rubber-band + retention nudge = paternalist | Güven yıkımı + escape motivasyonu | **REWORK (A+E)** |
| 6 | Meta-goal Scaffolding (Login+Quest+Milestone) | Locke&Latham, Frommel&Mandryk, Deci vd. | **MEDIUM/HIGH** | Üç paralel katmanın toplam yükü ölçülmemiş; undermining riski | Extrinsic pressure → intrinsic erosion | KEEP WITH CHANGES (B+C) |

**Kategori kodu hatırlatma:** A=uygulama · B=ölçek · C=çakışma · D=uzun vade zayıflar · E=fikir baştan problemli.

---

## 10. TOP 3 CORE DESIGN PROBLEMS

### P1 — Daily Maintenance (−5 effectiveness) — kategori E
**Neden #1:** Bilimsel olarak en zayıf; **loss-aversion** tabanlı external regulation; botun grace-friendly felsefesiyle iç çelişki. Frommel & Mandryk 2022 dark pattern taksonomisine birebir uyuyor. **En küçük düzeltme:** cezayı bonusa çevir (çiğ et harcanırsa +buff, harcanmazsa nötr). Aynı sink, tersine motivasyonel çerçeve.

### P2 — Coin Gambling’in Gizli Streak Modifier’ı + Retention Nudge — kategori A+E
**Neden #2:** Kullanıcı şikayetinin (“10 elde 1 kere kazanamadım”) kök nedenlerinden biri. Rubber-band pattern DDA meta-analizlerinde uyarılan bir yapı; autonomy + algılanan adalet yıkıcı. Aynı zamanda coin-only olmasıyla dark-pattern sınırının **iç tarafında** ama **pattern iskeleti kumar**. **En küçük düzeltme:** streak modifier’ı ya kaldır ya görünür yap; retention nudge’ı bu kanaldan çek; RTP’yi oyuncuya açıkla.

### P3 — Autonomy Ekseninin Sistematik Eksikliği — kategori A+D (çapraz)
**Neden #3:** Hunt’ta karar yok, evolution otomatik, trait rastgele, build yok. SDT’nin üç ihtiyacından **autonomy** en zayıf beslenen. Ryan/Deci literatürü uzun vadede autonomy olmadan competence + relatedness’ın yetmediğini gösterir. **En küçük düzeltmeler dağınık:** trait tercihi, level-up tek karar puanı, hunt’ta 2–3 taktik butonu. Her biri küçük ama toplamda autonomy eğrisi ölçülür oranda yükselir.

---

## 11. TOP 3 CORE DESIGN STRENGTHS

### S1 — Hunt Loop’un Tempo + Feedback + Pity Üçlüsü
**Neden #1:** GameFlow + SDT + reward-learning literatürü aynı yönde. 7 sn cooldown Discord bağlamında ideal, pity var ve iyi tasarlanmış, minimum garanti (tartışmalı olsa da) algılanan adaleti destekliyor. **Dokunma:** loop’un çekirdek parametreleri (cooldown, pity threshold, streak bonus rate) doğru yerlerde; sadece **görünürlük** eksik.

### S2 — Hunt Milestone Silent-Reset Kararı (yeni)
**Neden #2:** Frommel & Mandryk 2022’nin “kaçırma cezasını azaltma” önerisiyle birebir uyumlu; Bäcklund vd. 2022’nin sağlıklı retention önerisiyle uyumlu; hem kullanıcı isteğiyle hem bilimsel olarak doğru. Botun grace-friendly duruşunun **taşıyıcı sütunu**. **Dokunma:** bu yaklaşımı diğer sistemlere de yaymak; özellikle maintenance’ı bu felsefeye getirmek (P1 fix).

### S3 — Trade / Market’in Escrow + Ready Lock Yapısı + P2P Sosyal Zemin
**Neden #3:** Cole & Griffiths 2007’nin bulduğu MMORPG sosyal engagement retention faktörü Discord bot bağlamında canlı. Trade sistemi teknik olarak güvenli (escrow, dual confirm), sosyal olarak düşük engelli. Autonomy + relatedness aynı anda karşılanabilen tek sistem. **Dokunma:** Bu sistemi **daha da öne çıkarmak** (guild ticaret bonusu, hediye modu, kolektif guild hedefi) — long-term retention’ın gerçek taşıyıcısı burada.

---

## 12. INSUFFICIENT EVIDENCE bildirdiklerimiz (dürüstlük listesi)

- Prestige sonrası endgame’in oyuncu-uzun-vadeli davranışı (kod: prestige kaldırıldı, yerine geçen sistem ölçülmedi).
- Üç paralel meta-goal katmanının toplam extrinsic yükünün **OwlHunt-spesifik** deneysel etkisi (teorik risk yüksek; sayı yok).
- Coin gambling’in coin-only ortamda gerçek gaming-disorder-benzeri semptomlarla ilişkisi (loot box literatürü para karışan bağlamda güçlü; coin-only için analojik, doğrudan çalışma az).
- Auto-guarantee’nin (min prey) anticipation üzerindeki etkisinin doğrudan ölçümü (Loewenstein’den teorik çıkarım, ampirik veri yok).

Bu kalemler için karar vermeden önce **metrik toplanmalı** (rapor P1–P5). Aksi halde “bilmediğimizi bilmiyoruz” hatası.

---

## 13. Sonuç: “Hangisi sağlam, hangisi tehlikeli, hangisine dokunmayalım?”

**Kesinlikle dokunulmaması gerekenler (dokunulursa botun kimliği bozulur, ve bilim de dokunulmaması gerektiğini söylüyor):**

- Hunt loop’un çekirdek parametreleri (7 sn cooldown, pity threshold=8, streak bonus rate)
- Hunt milestone silent-reset felsefesi
- Trade escrow + ready-lock yapısı
- Coin-only kumar sınırı (gerçek para karışmasın kararı)

**Şeffaflık + görünürlük ile küçük müdahale gerekenler (temel iyi, iletişim eksik):**

- Pity/streak/newbie bonuslarını görünür yap
- Drop oranlarını yayınla
- Hunt karar boyutu ekle (küçük)

**Ciddi yeniden tasarım gerekenler (temel fikir zayıf):**

- Daily maintenance-as-punishment → maintenance-as-bonus
- Coin gambling streak modifier + retention nudge → şeffaflık veya kaldırma
- Meta-goal katmanlarının birleşik görünümü + login streak’in tangible ödül eğrisinin yumuşatılması

**Uzun vadeli tasarım tartışması gerekenler (kapsam dışı, ayrıca ele alınmalı):**

- Prestige-sonrası meta-progression: rogue-lite modeli, sezonluk cycle, veya başka bir yapı?
- Guild sisteminin kolektif hedef + relatedness ile derinleştirilmesi
- Autonomy için build/trait/path karar katmanının şekli

---

## 14. Bu belge nasıl kullanılmalı

Bu bir **teşhis**. Uygulama listesi değil.

Uygulama listesi için [`owlhunt-engagement-action-list.md`](owlhunt-engagement-action-list.md) ayrı belgede. Bu belge, o listeyi hangi öncelikle okumak gerektiğinin bilimsel gerekçesini veriyor:

- Bu belgenin **P1 (maintenance)** → action-list’te **yeni eklenmesi gereken** madde (mevcut listede tam yok, oraya eklenmeli).
- Bu belgenin **P2 (gambling streak)** → action-list’teki **M1/M2 + streak modifier revizyonu** kalemleri.
- Bu belgenin **P3 (autonomy)** → action-list’teki **B4 (tame taktik derinliği), C4 (skill tree), B2 (biome seçimi)** kalemleri.

**Karar ilkesi:** Bir maddeyi uygulamadan önce, bu belgedeki **hangi bilimsel bulgunun** hangi **temel probleme** cevap verdiğini açıkça belirtin. Aksi halde “iyi hissettiren” ama etkisi belirsiz değişiklikler yaparız.

---

**Belge sonu.** Referans zincir: `player-engagement-motivation-review.md` → `owlhunt-engagement-action-list.md` → `owlhunt-core-design-audit.md` (bu belge). Üçü birlikte okunmalı.
