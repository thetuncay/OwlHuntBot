# OwlHuntBot Custom Emoji Art Brief

Bu dokuman, OwlHuntBot icin ozel cizilecek emojilerin isimlendirme standardi, teknik limitleri ve kullanim yerlerini tanimlar.

## Teknik Gereksinimler

- Statik emoji: PNG, 128x128
- Animasyonlu emoji: GIF/APNG, 128x128, 512KB alti
- Arka plan: Transparan
- Stil: Gece ormani, baykus temasi, temiz kontrast
- Isimlendirme: `owl_*` (kucuk harf + alt cizgi)

## Fazli Rollout

### Faz 1 (kritik / hemen)

- Slot, coinflip, blackjack, cooldown, coin/xp, basari/hata ikonlari
- Hedef: mevcut oyun looplarinda edit sayisini azaltmak

### Faz 2 (hunt core)

- Hunt prey seti, biome emojileri, quality emojileri
- Hedef: hunt ve encounter ekranlarini marka dili ile birlestirmek

### Faz 3 (genisletme)

- Buff, market, leaderboard, tame, upgrade stat ikonlari
- Hedef: butun UX katmaninda tek tip emoji registry kullanimi

## Registry Key Listesi (v1)

Asagidaki key'ler `src/config/custom-emojis.ts` ile birebir uyumludur.

### Brand / UI

- `brand.owl`
- `brand.owl_face`
- `ui.coin`
- `ui.xp`
- `ui.success`
- `ui.fail`
- `ui.warning`
- `ui.cooldown`
- `ui.locked`
- `ui.exit`
- `ui.hit`
- `ui.stand`

### Slot

- `slot.symbol.owl`
- `slot.symbol.snake`
- `slot.symbol.mouse`
- `slot.symbol.diamond`
- `slot.symbol.loss`
- `slot.symbol.cherry`
- `slot.symbol.bell`
- `slot.symbol.unknown`
- `slot.reel_spin` (anim)
- `slot.win_burst` (anim)
- `slot.jackpot` (anim)

### Gamble / PvP

- `gamble.coin_heads`
- `gamble.coin_tails`
- `gamble.card_back`
- `gamble.chip`
- `gamble.coin_flip` (anim)
- `gamble.cards_deal` (anim)
- `pvp.clash` (anim)
- `pvp.vs_flash` (anim)
- `pvp.sword`
- `pvp.shield`
- `pvp.win`
- `pvp.lose`

### Hunt Prey

- `hunt.prey.fare`
- `hunt.prey.serce`
- `hunt.prey.kurbaga`
- `hunt.prey.kertenkele`
- `hunt.prey.hamster`
- `hunt.prey.kostebek`
- `hunt.prey.yarasa`
- `hunt.prey.bildircin`
- `hunt.prey.guvercin`
- `hunt.prey.yilan`
- `hunt.prey.sincap`
- `hunt.prey.tavsan`
- `hunt.prey.gelincik`
- `hunt.prey.kirpi`
- `hunt.search` (anim)
- `hunt.critical`
- `hunt.empty`

### Biome / Quality

- `biome.town`
- `biome.forest`
- `biome.lake`
- `quality.trash`
- `quality.common`
- `quality.good`
- `quality.rare`
- `quality.elite`
- `quality.godroll`
- `quality.default`
- `quality.main`

## Faz 3 Backlog (simdilik fallback Unicode)

Bu anahtarlar ilerleyen asamada eklenecek:

- Buff itemlar: `buff.b001` ... `buff.b006` (av buff'ları)
- Market kategori: `cat.owl`, `cat.item`, `cat.buff`, `cat.material`, `cat.prey`
- Leaderboard: `lb.power`, `lb.hunt`, `lb.relic`, `lb.arena`, `lb.wealth`
- Tame: `tame.calm`, `tame.aggressive`, `tame.curious`, `tame.timeout`, `tame.pulse` (anim)
- Upgrade stat: `stat.beak`, `stat.eye`, `stat.ear`, `stat.wing`, `stat.claw`

## Tasarim Notlari

- Slot sembollerinde siluet okunurlugu oncelikli olmali.
- `slot.reel_spin` loop animasyonu 3 kare ile akici olmali.
- `pvp.clash` ve `gamble.coin_flip` cok hizli degil, okunabilir bir tempo ile loop etsin.
- `quality.*` ikonlari, mevcut renk hiyerarsisi ile tutarli olmali.
