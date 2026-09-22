# FEATURE_PLAN — Sosyal aksiyonlar (kiss / hug / …)

## 1. Problem
Sunucuda OwO tarzı hafif sosyal etkileşim yok; relatedness boş.

## 2. Goal
`w kiss|hug|love|punch|slap|pat|cuddle|wave|highfive|poke @kisi` → embed + GIF.

## 3. UX
Author avatar + `{isim} kissed {hedef}!` + GIF. Mention yoksa kısa kullanım.

## 4–5. Systems
`config/social-actions.ts`, `systems/social-gifs.ts`, `commands/owl-social.ts` → `owl.ts`.

## 6. Database
Yok.

## 7. Economy
Nötr. Cooldown 4s. SFW API only (waifu.pics / nekos.best) — açık NSFW endpoint yok.

## 8. Gameplay
Relatedness +; core loop nötr.

## 9. Edge
Self / bot / mention yok; API fail → cache veya hata satırı.

## 10. Tests
Action resolve + alias + template.

## 11. Rollback
Alias + case kaldır.

## 12. Metrics
Yok (opsiyonel telemetry sonra).
