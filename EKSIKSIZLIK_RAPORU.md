# BaykusBot Eksiksizlik ve Uyum Raporu

Bu rapor `oyun botunun mantığı.txt` belgesi ile mevcut kodun bire bir uyum kontrolu sonucunda olusturulmustur.

## 1) Komut Yapisı Uyum Durumu

- `owl hunt` ve `owl avlan` (alias) -> `src/commands/owl.ts` icinde aktif.
- `owl vs @kullanici` -> `src/commands/owl.ts` icinde butonlu kabul/reddet akisiyla aktif.
- `owl setmain` -> cooldown, PvP, aktif av, HP `%30` kontrolu ve coin maliyeti ile aktif.
- `owl inventory` -> sayfalama + slot kapasitesi formulu (`30 + level * 2`) aktif.
- `owl stats` ve `owl stats --deep` -> katmanli gorunum aktif.
- `owl upgrade <stat>` -> onay butonlu akis aktif.
- `bj`, `slot`, `coinflip` -> ayri komut dosyalariyla aktif.

## 2) Ana Formuller (Belge 13.2 Referansi)

- XP gerekliligi: `round(100 * (L ^ 1.65) + (L * 20))` -> `src/utils/math.ts`
- XP olcekleme: `Base XP * (1 + Level * 0.03)` -> `src/utils/math.ts`
- Stamina: `100 + (Kanat * 0.5)` -> `src/utils/math.ts`
- PvP momentum: `1 + (tur * 0.05)` -> `src/utils/math.ts`
- Soft cap: `(Stat * 70) / (Stat + 30)` -> `src/utils/math.ts`
- Switch cost: `500 + (Toplam Tier * 200)` -> `src/utils/math.ts`
- Hunt rolls: `3 + floor(level / 5)` -> `src/utils/math.ts`
- Bond bonusu: `Bond * 0.2` -> `src/utils/math.ts`
- Encounter chance clamp(0.5, 15), tame clamp(2,92), upgrade clamp(5,95), catch clamp(0.05,0.95), gamble clamp(1,99) -> `src/utils/math.ts`

## 3) Hunt Mekanikleri

- Spawn score + normalizasyon mantigi aktif (`spawnScore` + agirlikli secim).
- Yüksek zorluklu avdan tur basina max 1 adet siniri aktif.
- Catch chance tier gap cezasi (`>=2` -> `x0.6`) aktif.
- Sonuc turleri: basari / kacti / yaralandi ayrimi aktif.
- XP katmanlari: fail XP `%30`, risk bonus `%50`, combo bonus (`+10/+25`) aktif.

## 4) PvP Mekanikleri

- Stat `%70` + RNG `%30` agirligi aktif.
- Stamina cezalari (`60-30`, `30-10`, `<10`) aktif.
- Execute kosulu: hedef HP `< %20` ve hedef stamina `<30` aktif.
- PvP bitisinde XP/coin guncelleme transaction icinde aktif.
- PvP sayacina bagli repair effectiveness dususu aktif.

## 5) Tame Mekanikleri

- Encounter sans formulu aktif.
- Level gating ile tier unlock aktif.
- Spawn tier secimi oyuncu tierine yakin agirlikli secim ile aktif.
- Quality score hesaplama + quality adjustment aktif.
- Tame sans formulu + clamp aktif.
- Max 3 deneme, fail streak `+%5`, tekrar cezasi `-%10` aktif.
- Tek denemede max 2 farkli item + duplicate item yasagi aktif.
- Basarisizlik dallari `%60/%25/%15` aktif.
- Mini PvP dali aktif; kazanma sonraki denemeye bonus etkisiyle ilerliyor.

## 6) Upgrade Mekanikleri

- Upgrade sans formulu + clamp aktif.
- Level <40 stat dusmeme, 40+ icin dusme riski (`%20`) aktif.
- Kaynak kontrolu + kaynak dusumu + stat guncellemesi transaction icinde aktif.
- Upgrade item bonus tablosu config merkezli aktif.

## 7) Gambling Mekanikleri

- Coin flip `49%` / payout `1.95` aktif.
- Slot tablo sanslari + gizli jackpot `%0.2` aktif.
- Blackjack payoutlari (`1.5` / `1.9`) aktif.
- Dealer soft 17 hit aktif.
- Streak modlari, zenginlik cezasi, buyuk bahis cezasi ve clamp aktif.

## 8) Inventory ve Item Kurallari

- Stack limit referanslari configte tanimli.
- Max 2 item/deneme ve duplicate item yasağı tame+upgrade tarafinda aktif.
- Auto-sink economy katmaninda aktif.

## 9) Lock + Transaction + Anti-Exploit

- Kritik islemlerde Redis lock (`withLock`) aktif.
- Coin/XP/stat degisimlerinin transaction icinde yurutulmesi aktif.
- Redis rate limit + susturma mekanigi aktif.

## 10) Uygulanan Son Eklemeler (Bu Tur)

- Item bonus tablolari config merkezine tasindi.
- Tame encounter kalite ve stat roll sistemi eklendi.
- Tame/upgrade item deneme limitleri sertlestirildi.
- PvP execute kosulu belgeyle bire bir hizalandi.
- Owl komut seti belge komut adlarina cekildi.
- Quick View footer stamina/power bilgilerini tasiyacak sekilde genisletildi.

## 11) Kontrol Ozeti

- `TODO`/placeholder yok.
- `any` kullanimi yok.
- Lint kontrolu temiz (`src` kapsaminda).

