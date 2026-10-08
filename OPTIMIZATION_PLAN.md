# OwlHunt optimizasyon planı

Temel ilke: dışarıdan görünen davranış değişmez. Aynı bot, daha az iş.

Ayrıntılı bulgular, kararlar ve kurulumlar: [`OPTIMIZATION_LOG.md`](OPTIMIZATION_LOG.md).
Ölçüm çıktıları: `benchmarks/results/` (yerel JSON; gitignore).

## Mevcut durum

| Alan | Değer |
|------|-------|
| Branch | `perf/optimization` (kaynak: `main` @ `cb5b1b5`) |
| Aktif faz | **Faz 3 bitti** — B1–B6, O2 kilit süresi, O5, O7. O1 ölçüldü ve durdu. O3/O6 10 kişilik ekipte uygulanmadı. Animasyon sleep aynı |
| Son onay | Kullanıcı: onay beklemeden günlüğü bitir |
| Sonraki kapı | Faz 4 tekrar ölçüm. Sleep ve `ORDER BY RANDOM()` aynı |

## Fazlar ve onay kapıları

| Faz | İçerik | Kod değişikliği | Kapı |
|-----|--------|-----------------|------|
| 0 | Ortam envanteri, repo haritası, hot path, 14 hipotez, kalıp taraması | Yok | Rapor + sorular, onay |
| 1 | İzole bench ortamı (Postgres 5434, Redis 6390), sahte Discord harness, baseline, kapasite eğrisi, soak | Yalnızca `benchmarks/` ve onaylı devDependencies | Baseline raporu, onay |
| 2 | Bulgu kataloğu ve önceliklendirme | Yok | Uygulanacak maddeler birlikte seçilir |
| 3 | Alan bazlı uygulama (madde başına test, ölç, geri al) | Onaylı maddeler | Madde bazlı raporlama |
| 4 | Final doğrulama, kapasite/soak tekrarı, yayın ve geri alma planı | Yok / küçük | Final rapor |

## Sınırlar (her fazda)

- `.env` okunmaz, çıktıya yazılmaz.
- `5433` (OwlHunt Postgres) ve `6380` (OwlHunt Redis) adreslerine bağlanılmaz. Bu PC şu an tek gerçek ortam.
- Commit yalnızca faz onayından sonra, bu branch'e. Push yok (auto-push askıda).
- Index, şema, cache/TTL, queue semantiği, shard/global iş, animasyon zamanlaması: her seferinde sorulur.
- Bug'lar optimizasyondan ayrı raporlanır, onay olmadan düzeltilmez.
