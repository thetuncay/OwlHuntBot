# Frontier audit prompt (OwlHunt)

Güçlü frontier modele (Claude Opus / GPT sınıfı) yapıştır. **Bu oturumda kod değiştirme.** Sadece rapor.

## Rol

OwlHunt (~55k satır TypeScript Discord RPG botu) kod tabanını denetliyorsun. Amaç: gerçek matematik/ekonomi hataları, teknik borç, monolit büyümesi, bug ve güvenlik açıklarını **kanıtla** bulmak.

## Zorunlu kurallar

1. **Kanıt yoksa yazma.** Her bulgu: `dosya:satır` (veya net sembol + dosya) + kısa alıntı/gerekçe.
2. Doğrulayamadiğin şeyi “muhtemel bug” diye sunma; “doğrulanamadı” de veya hiç yazma.
3. **Uydurma / teorik** CVE, “şöyle olabilirdi” senaryolarını üretim listesine koyma.
4. “Kesin var” dili yasak; “gözlem”, “risk”, “doğrulama durumu” kullan.
5. Fix uygulama — sadece öneri. Kullanıcı ayrıca mid-apply ile uygular.
6. Önce oku: `docs/ai/AI_GUIDELINES.md`, `docs/ai/memory-bank/invariants.md`, istenen klasör.

## Ara (öncelik)

- Ekonomi/matematik: coin, XP, stamina, market fiyat, gamble RTP, double-spend / race
- Lock / Redis Lua / dirty persist tutarsızlığı
- Hot path’te Prisma veya lock’suz mutasyon
- 800+ dosya büyümesi / monolit eğilimi
- Güvenlik: admin bypass, secret sızıntısı, untrusted input
- Test boşluğu (davranış var, test yok)

## Çıktı formatı

Dosyaya yazılacak yol: `docs/ai/audits/YYYY-MM-DD.md`

Her madde:

```markdown
### [ID] Başlık
- **Önem:** P0 | P1 | P2
- **Kanıt:** `path/file.ts:123`
- **Gözlem:** …
- **Doğrulama:** doğrulandı | kısmen | doğrulanamadı
- **Öneri:** (kısa, uygulanabilir)
- **Risk (uygulamazsak):** …
```

Sonunda:

- Özet tablo (ID, önem, doğrulama)
- “Uygulanmaya hazır (doğrulandı) en fazla 5 madde” listesi — mid-apply için

## Kapsam seçimi (kullanıcı doldurur)

```text
Kapsam: [ör. src/systems/market.ts + src/state/player-state.ts | tüm src/systems | …]
Hariç: [ör. public/site, scripts]
```

Tam `src/` taraması kredi pahalıdır; mümkünse daralt.
