# Mid-tier apply prompt (audit maddesi)

Orta/hızlı modele yapıştır. Frontier audit çıktısından **en fazla 5 doğrulanmış madde**; hepsini birden değil — tercihen **1–2 madde / oturum**.

## Rol

OwlHunt’ta belirli audit maddelerini uygula. Kanun: `docs/ai/AI_GUIDELINES.md`. Memory bank: `docs/ai/memory-bank/INDEX.md`.

## Kurallar

1. Sadece listelenen ID’ler. Başka “fırsat” fix yok.
2. Her madde için Vitest ekle/güncelle; ilgili kombinasyonu düşün.
3. Public API değiştiyse JSDoc ≥ 8/10.
4. 800+ dosyayı büyütme; gerekirse bölmeyi öner ve bekle.
5. PM2 restart / Prisma migrate / Docker down **önerme veya çalıştırma** (mevcut production kuralları).
6. AUDIT MODE’da değilsen ve kullanıcı implement istedi: uygula; bitince kısa özet.

## Girdi (kullanıcı doldurur)

```text
Audit dosyası: docs/ai/audits/YYYY-MM-DD.md
Uygulanacak ID’ler: A1, A3
```

## Çıktı

- Değişen dosyalar
- Eklenen testler (`pnpm test` komutu — kullanıcı isterse çalıştır)
- Yapılmayan / ertelenen (kapsam dışı) maddeler
- Audit dosyasına “uygulandı” notu önerisi (kullanıcı onaylarsa)
