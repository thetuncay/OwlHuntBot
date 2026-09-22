# OwlHunt — Bulut Veritabani Yedekleme (VDS'ten Bagimsiz)

**Kaynak dogruluk Google Drive'dir.** VDS kapansa bile veriler Drive'da kalir.

## Temiz klasor yapisi

```
OwlHuntBot-DB-Backups/
  latest/              ← saatlik guncellenir (tek guncel kopya)
  daily/
    2026-09-02/        ← gunde 1 arsiv (silinmez)
    2026-09-03/
  _meta/
```

| Klasor | Ne zaman yazar | Silinir mi? |
|--------|----------------|-------------|
| `latest/` | Her saat | Hayir — icerik uzerine yazilir (tek set) |
| `daily/YYYY-MM-DD/` | Gunde ilk yedek | Hayir — yeni gun = yeni klasor |
| Eski stamp (`2026/09/02/...`) | Artik yok | — |

## Otomatik

```bash
bash scripts/install-db-backup-cron.sh   # saatte bir + reboot
```

## .env

```env
BACKUP_ENABLED=1
BACKUP_REQUIRE_CLOUD=1
BACKUP_RCLONE_REMOTE=owlhunt_backup:OwlHuntBot-DB-Backups
BACKUP_DAILY_ARCHIVE=1
BACKUP_LOCAL_RETENTION_DAYS=2
```

## Geri yukleme

```bash
bash scripts/restore-from-gdrive.sh --latest
bash scripts/restore-from-gdrive.sh --daily 2026-09-02
```

## Eski duzeni temizle (bir kez)

```bash
bash scripts/cleanup-gdrive-backup-layout.sh
```
