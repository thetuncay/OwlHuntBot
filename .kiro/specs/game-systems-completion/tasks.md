# Uygulama Planı: Game Systems Completion

## Genel Bakış

Bu plan, BaykusBot'taki üç bağımsız eksikliği tamamlar: prestige XP bonusunun deep stats ekranına eklenmesi, tame quest takibinin `amount` parametresiyle düzeltilmesi ve quest ilerleme çubuğunun görsel hale getirilmesi. Tüm değişiklikler mevcut dört dosyaya yerinde düzenleme olarak uygulanır; yeni dosya oluşturulmaz. Her görev bağımsız olarak uygulanabilir ve `pnpm build` ile doğrulanabilir.

---

## Görevler

- [x] 1. Prestige XP Bonusu — `src/utils/stats-ux.ts` deep bloğuna satır ekle
  - `buildOwlStatsEmbed` içindeki `deep` dalında, `breakdown` string'inin `🌟 Prestige: +X stat cap` satırının hemen ardına `🌟 Prestige XP:   **+${prestige * 5}%**\n` satırını ekle
  - `prestige` değişkeni zaten `player.prestigeLevel || 0` olarak tanımlı; ek değişken gerekmez
  - Prestige 0 olduğunda `+0%` görüntülenmeli; `deep` kapalıyken bu satır hiç eklenmemeli
  - `pnpm build` ile TypeScript derleme hatası olmadığını doğrula
  - _Gereksinimler: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Prestige XP Bonusu — `src/commands/owl-stats.ts` doğrulaması
  - `runStats` ve `runStatsMessage` içindeki `PlayerStatsData` nesnelerinde `prestigeLevel: player.prestigeLevel || 0` alanının zaten mevcut olduğunu doğrula
  - Eksikse ekle; mevcutsa değişiklik gerekmez
  - `pnpm build` ile derleme hatası olmadığını doğrula
  - _Gereksinimler: 1.1, 1.5_

- [x] 3. Tame Quest Takibi — `src/systems/tame.ts` çağrılarını güncelle
  - [x] 3.1 `commitTameResult` içindeki `trackQuestProgress` çağrısını güncelle
    - `success === true` dalında mevcut `trackQuestProgress(prisma, playerId, 'tame').catch(() => null)` çağrısını `trackQuestProgress(prisma, playerId, 'tame', 1).catch(() => null)` olarak değiştir
    - _Gereksinimler: 2.1, 2.3, 2.6_

  - [x] 3.2 `attemptTame` içindeki `trackQuestProgress` çağrısını güncelle
    - `won === true` dalında mevcut `trackQuestProgress(prisma, playerId, 'tame').catch(() => null)` çağrısını `trackQuestProgress(prisma, playerId, 'tame', 1).catch(() => null)` olarak değiştir
    - Başarısız dalların (kaçış, yaralanma, PvP kaybı, düz başarısızlık) hiçbirinde `trackQuestProgress` çağrısı yapılmadığını doğrula
    - _Gereksinimler: 2.2, 2.3, 2.6_

  - [x] 3.3 `pnpm build` ile derleme hatası olmadığını doğrula
    - _Gereksinimler: 2.4, 2.5_

- [x] 4. Quest İlerleme Çubuğu — `src/commands/owl-quests.ts` güncelle
  - [x] 4.1 `hpBar` import'unu ekle
    - Dosyanın üstüne `import { hpBar } from '../utils/theme';` satırını ekle
    - _Gereksinimler: 3.1, 3.2_

  - [x] 4.2 `runQuestsMessage` içindeki `status` string'ini güncelle
    - `⏳ ${q.current}/${q.target}` ifadesini `` `\`${hpBar(q.current, q.target, 10)}\` ${q.current}/${q.target}` `` ile değiştir
    - `✅ Alındı` ve `🌟 Tamamlandı` dalları değişmeden kalmalı
    - _Gereksinimler: 3.1, 3.2, 3.3, 3.4, 3.5, 3.8_

  - [x] 4.3 `runQuestsSlash` içindeki `status` string'ini güncelle
    - `runQuestsMessage` ile aynı değişikliği `runQuestsSlash` içindeki `status` satırına uygula
    - _Gereksinimler: 3.1, 3.2, 3.3, 3.4, 3.5, 3.8_

  - [x] 4.4 `pnpm build` ile derleme hatası olmadığını doğrula
    - _Gereksinimler: 3.6, 3.7_

- [x] 5. `hpBar` doğruluk özellikleri — `src/utils/theme.test.ts` güncelle
  - [x] 5.1 Özellik 1 için property testi yaz — Çıktı Uzunluğu
    - **Özellik 1: Çıktı Uzunluğu**
    - `hpBar(current, target, 10)` her zaman tam olarak 10 karakter uzunluğunda string döndürür
    - Generator: `target` 1–1000 arası tam sayı; `current` 0 ile `target - 1` arası tam sayı
    - **Doğrular: Gereksinim 3.6**

  - [x] 5.2 Özellik 2 için property testi yaz — Dolu Segment Sayısı
    - **Özellik 2: Dolu Segment Sayısı**
    - `hpBar(current, target, 10)` içindeki `█` sayısı `Math.round((current / target) * 10)` ile eşit olmalı
    - Generator: `target` 1–1000 arası tam sayı; `current` 0 ile `target` arası tam sayı (sınır dahil)
    - **Doğrular: Gereksinim 3.7**

  - [x] 5.3 Özellik 3 için property testi yaz — Yalnızca Geçerli Karakterler
    - **Özellik 3: Yalnızca Geçerli Karakterler**
    - `hpBar` çıktısı yalnızca `█` ve `░` karakterlerinden oluşur
    - Generator: `target` 1–1000 arası tam sayı; `current` 0 ile `target` arası tam sayı (sınır dahil)
    - **Doğrular: Gereksinim 3.6**

- [x] 6. Son kontrol noktası — tüm testler geçmeli
  - `pnpm test` komutunu çalıştır ve tüm testlerin geçtiğini doğrula; sorular varsa kullanıcıya sor.

---

## Notlar

- `*` ile işaretli görevler isteğe bağlıdır; hızlı MVP için atlanabilir
- Her görev bağımsızdır; herhangi bir sırayla uygulanabilir
- Görev 1 ve 2 birlikte ele alınmalı (aynı özellik, iki dosya)
- Görev 3 tek dosya değişikliği; `amount` parametresi eklenmesi yeterli
- Görev 4 tek dosya değişikliği; import + iki handler güncellenmesi yeterli
- Property testleri `src/utils/theme.test.ts` içindeki mevcut `fast-check` yapısına eklenir
