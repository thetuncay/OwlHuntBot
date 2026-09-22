# OwlHunt — Geri Bildirim Anketi (Discord duyuru)

## Link

https://owlhunt.thetuncay.com/feedback

## Önerilen duyuru metni

> **OwlHunt Geri Bildirim Anketi** (~15 dk) — Görüşün bizim için çok değerli.  
> Siteye Discord ile giriş yap, anketi doldur: **https://owlhunt.thetuncay.com/feedback**  
> **Ödül (tek seferlik):** 5.000 coin + 5 Eşya Kutusu  
> Bot kayıtlı olman gerekir (ödül için); anketi herkes gönderebilir.

## Discord duyurusu

Anket ödülü alındığında (submit veya claim) ana sunucuda otomatik mesaj:

> @kullanıcı anketi tamamlayıp **5.000** coin ve **5** kutu kazandı — sen de çözmek için: https://owlhunt.thetuncay.com/login?next=%2Ffeedback

`.env`: `FEEDBACK_ANNOUNCE_CHANNEL_ID` (yoksa ilk owl-only kanal). Kapatmak: `FEEDBACK_ANNOUNCE_ENABLED=0`

## Deploy sonrası

```bash
pnpm db:migrate
npx tsx scripts/seed-feedback-campaign.ts
pnpm build
pm2 restart owlhuntbot-ops-panel
```

## Admin

- `/admin` → **Feedback** butonu → son cevaplar
- CSV: `/api/admin/feedback/export.csv` (Basic Auth)
