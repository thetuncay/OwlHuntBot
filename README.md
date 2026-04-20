# BaykusBot

TypeScript tabanli, production odakli RPG/Economy Discord bot altyapisi.

## Teknoloji

- TypeScript 5 (strict mode)
- discord.js v14
- MongoDB + Prisma
- Redis (ioredis)
- Zod
- ESLint + Prettier

## Kurulum

1. `pnpm install`
2. `.env` dosyasini doldur
3. MongoDB servisinin calistigindan emin ol
4. `pnpm prisma:generate`
5. `pnpm prisma:db:push`
6. `pnpm deploy:commands`
7. `pnpm dev`

## Komutlar

- Metin komutlari slashsiz kullanilabilir: `owl hunt`, `owl yardim` veya ozel prefix ile `w hunt`
- `/owl yardim`
- `/owl prefix deger:<w>`
- `/owl hunt` veya `/owl avlan`
- `/owl vs kullanici:@kullanici`
- `/owl setmain baykus:<id>`
- `/owl inventory`
- `/owl stats deep:true|false`
- `/owl upgrade stat:<gaga|goz|kulak|kanat|pence>`
- `/coinflip`
- `/slot`
- `/bj`

## Guvenlik

- Kritik operasyonlarda Redis lock (`withLock`)
- Finansal degisimlerde Prisma transaction
- Redis tabanli anti-spam ve cooldown

## Notlar

- Tum sabitler `src/config.ts` uzerinden yonetilir.
- Is mantigi `src/systems` altinda toplanmistir.
- MongoDB kalici veriler icin kullanilir (oyuncular, baykuslar, envanter, oturumlar).
- Redis cache/hiz katmani icin kullanilir (anti-spam, cooldown, prefix cache).
- Yeni oyuncular komut kullandiginda kullanim sartlarini butonla onaylar; onayla birlikte baslangic main baykus olusturulur.
- Kayit logunda oyuncu id, username, sunucu nicki ve kayit olunan sunucu bilgisi saklanir.
