# Gereksinimler Belgesi

## Giriş

BaykusBot, Discord üzerinde çalışan Türkçe bir RPG/Economy oyun botudur. Şu anda bot çıktıları birden fazla UX dosyasında tutarsız biçimde tanımlanmıştır: `stats-ux.ts`, `inventory-ux.ts`, `upgrade-ux.ts`, `pvp-ux.ts` ve `hunt-ux.ts` dosyalarının her biri kendi renk sabitlerini, bar fonksiyonlarını ve format yardımcılarını bağımsız olarak tanımlamaktadır. Merkezi `theme.ts` dosyası mevcut olmakla birlikte bu dosyalar tarafından kullanılmamaktadır.

Bu özellik, tüm UX dosyalarını tek bir `theme.ts` kaynağından besleyen birleşik bir tema sistemi oluşturmayı hedefler. Tema değişikliği için yalnızca `theme.ts` dosyasının düzenlenmesi yeterli olacaktır.

## Sözlük

- **Theme_System**: `src/utils/theme.ts` dosyasında tanımlanan merkezi tema modülü.
- **UX_File**: `stats-ux.ts`, `inventory-ux.ts`, `upgrade-ux.ts`, `pvp-ux.ts` veya `hunt-ux.ts` dosyalarından herhangi biri.
- **Color_Token**: `COLORS` nesnesinde tanımlı, isme göre erişilen onaltılık renk değeri (örn. `COLORS.PRIMARY`).
- **Bar_Function**: Sayısal bir oranı görsel karakter dizisine dönüştüren saf fonksiyon.
- **Format_Helper**: Metin satırı üreten yardımcı fonksiyon (örn. `errLine`, `okLine`, `sectionTitle`).
- **Quality_Badge**: Bir öğenin kalite seviyesini temsil eden emoji+metin çifti (örn. `🟩 Good`).
- **Tier_Label**: Bir baykuşun tier seviyesini temsil eden metin (örn. `T3 ◆◆◆◆◆◆◇◇`).
- **Charge_Bar**: `▰▱` karakterleriyle gösterilen doluluk barı.
- **HP_Bar**: `█░` karakterleriyle gösterilen can barı.
- **Slot_Bar**: Envanter doluluk barı.
- **Chance_Bar**: Yüzde değerini renkli gösterge ile birlikte sunan bar.
- **Embed_Builder**: Discord.js `EmbedBuilder` nesnesi döndüren fonksiyon.
- **Duplicate_Definition**: Aynı işlevi gören kodun birden fazla dosyada ayrı ayrı tanımlanması durumu.

---

## Gereksinimler

### Gereksinim 1: Merkezi Renk Paleti

**Kullanıcı Hikayesi:** Bir geliştirici olarak, tüm bot renklerini tek bir yerden yönetmek istiyorum; böylece tema değişikliği için yalnızca `theme.ts` dosyasını düzenlemem yeterli olsun.

#### Kabul Kriterleri

1. THE Theme_System SHALL `COLORS` adlı bir nesne ihraç etmeli (export) ve bu nesne şu Color_Token'ları içermelidir: `PRIMARY` (#5865F2), `SUCCESS` (#57F287), `DANGER` (#ED4245), `WARNING` (#FEE75C), `MUTED` (#4F545C), `HUNT` (#2C3E50), `RARE` (#F1C40F), `TAME` (#3498DB), `BUFF` (#9B59B6), `MARKET` (#27AE60).
2. WHEN bir UX_File renk değerine ihtiyaç duyduğunda, THE UX_File SHALL renk değerini yalnızca `theme.ts`'den import edilen `COLORS` nesnesinden almalıdır.
3. IF bir UX_File `theme.ts` dışında yerel bir renk sabiti tanımlarsa, THEN THE Theme_System SHALL bu durumu derleme zamanında TypeScript tip sistemi aracılığıyla tespit edilebilir kılmalıdır.
4. THE Theme_System SHALL `embed.ts` dosyasının `config`'den import ettiği `COLOR_FAIL`, `COLOR_INFO`, `COLOR_SUCCESS`, `COLOR_WARNING` sabitlerini `COLORS.DANGER`, `COLORS.PRIMARY`, `COLORS.SUCCESS`, `COLORS.WARNING` olarak karşılamalıdır.

---

### Gereksinim 2: Birleşik Bar Fonksiyonları

**Kullanıcı Hikayesi:** Bir geliştirici olarak, tüm bar fonksiyonlarının tek bir kaynaktan gelmesini istiyorum; böylece bar görünümünü değiştirmek için yalnızca `theme.ts` dosyasını düzenlemem yeterli olsun.

#### Kabul Kriterleri

1. THE Theme_System SHALL `hpBar(current, max, length?)` adlı bir Bar_Function ihraç etmeli ve bu fonksiyon `█░` karakterleriyle monospace bir HP_Bar döndürmelidir.
2. THE Theme_System SHALL `hpBarColored(hp, hpMax, length?)` adlı bir Bar_Function ihraç etmeli ve bu fonksiyon renkli gösterge emoji (`🟩`/`🟨`/`🟥`) ile birlikte monospace HP_Bar döndürmelidir.
3. THE Theme_System SHALL `chargeBar(current, max, length?)` adlı bir Bar_Function ihraç etmeli ve bu fonksiyon `▰▱` karakterleriyle Charge_Bar döndürmelidir.
4. THE Theme_System SHALL `slotBar(used, total, length?)` adlı bir Bar_Function ihraç etmeli ve bu fonksiyon doluluk oranı %90 veya üzerinde olduğunda `⚠️` uyarı işareti eklenmiş Slot_Bar döndürmelidir.
5. THE Theme_System SHALL `chanceBar(chance, length?)` adlı bir Bar_Function ihraç etmeli ve bu fonksiyon şans değerine göre `🟢`/`🟡`/`🔴` renk noktası ile birlikte yüzde değerini göstermelidir.
6. WHEN bir UX_File bar görselleştirmesine ihtiyaç duyduğunda, THE UX_File SHALL yalnızca `theme.ts`'den import edilen Bar_Function'ları kullanmalıdır; yerel `bar()`, `hpBar()`, `chargeBar()`, `slotBar()` veya `chanceBar()` tanımları içermemelidir.
7. WHEN `hpBarColored` fonksiyonuna HP oranı 0.5'ten büyük bir değer verildiğinde, THE Theme_System SHALL `🟩` renk göstergesi döndürmelidir.
8. WHEN `hpBarColored` fonksiyonuna HP oranı 0.25 ile 0.5 arasında bir değer verildiğinde, THE Theme_System SHALL `🟨` renk göstergesi döndürmelidir.
9. WHEN `hpBarColored` fonksiyonuna HP oranı 0.25 veya altında bir değer verildiğinde, THE Theme_System SHALL `🟥` renk göstergesi döndürmelidir.
10. FOR ALL Bar_Function çağrılarında, WHEN `current` değeri `max` değerinden büyük verildiğinde, THE Theme_System SHALL barı tam dolu (`████████`) olarak döndürmelidir.
11. FOR ALL Bar_Function çağrılarında, WHEN `max` değeri sıfır verildiğinde, THE Theme_System SHALL barı tam boş (`░░░░░░░░`) olarak döndürmelidir.

---

### Gereksinim 3: Format Yardımcıları

**Kullanıcı Hikayesi:** Bir geliştirici olarak, başlık, hata, başarı ve uyarı satırlarının tek bir kaynaktan gelmesini istiyorum; böylece format değişikliği için yalnızca `theme.ts` dosyasını düzenlemem yeterli olsun.

#### Kabul Kriterleri

1. THE Theme_System SHALL `sectionTitle(title, width?)` adlı bir Format_Helper ihraç etmeli ve bu fonksiyon `══════ 🦉 Başlık ══════` formatında bir başlık satırı döndürmelidir.
2. THE Theme_System SHALL `errLine(msg)` adlı bir Format_Helper ihraç etmeli ve bu fonksiyon `✗ mesaj` formatında bir hata satırı döndürmelidir.
3. THE Theme_System SHALL `okLine(msg)` adlı bir Format_Helper ihraç etmeli ve bu fonksiyon `✓ mesaj` formatında bir başarı satırı döndürmelidir.
4. THE Theme_System SHALL `warnLine(msg)` adlı bir Format_Helper ihraç etmeli ve bu fonksiyon `⚠ mesaj` formatında bir uyarı satırı döndürmelidir.
5. THE Theme_System SHALL `pipeLine(msg)` adlı bir Format_Helper ihraç etmeli ve bu fonksiyon `🌙 | mesaj` formatında bir pipe satırı döndürmelidir.
6. WHEN bir UX_File hata, başarı veya uyarı satırı oluşturduğunda, THE UX_File SHALL yalnızca `theme.ts`'den import edilen Format_Helper fonksiyonlarını kullanmalıdır.

---

### Gereksinim 4: Kalite ve Tier Göstergeleri

**Kullanıcı Hikayesi:** Bir geliştirici olarak, kalite badge'leri ve tier etiketlerinin tek bir kaynaktan gelmesini istiyorum; böylece görsel değişiklik için yalnızca `theme.ts` dosyasını düzenlemem yeterli olsun.

#### Kabul Kriterleri

1. THE Theme_System SHALL `QUALITY_BADGE` adlı bir nesne ihraç etmeli ve bu nesne şu eşlemeleri içermelidir: `Trash → ⬛`, `Common → ⬜`, `Good → 🟩`, `Rare → 🟦`, `Elite → 🟪`, `God Roll → 🌟`.
2. THE Theme_System SHALL `QUALITY_COLOR` adlı bir nesne ihraç etmeli ve kalite seviyelerine karşılık gelen Color_Token değerlerini içermelidir.
3. THE Theme_System SHALL `TIER_LABEL` adlı bir nesne ihraç etmeli ve 1'den 8'e kadar tier seviyelerine karşılık gelen `T{n} ◆◆...◇◇` formatında etiketler içermelidir.
4. THE Theme_System SHALL `RARITY_BADGE` adlı bir nesne ihraç etmeli ve `Legendary`, `Epic`, `Rare`, `Uncommon`, `Common` nadirlik seviyelerine karşılık gelen emoji badge'leri içermelidir.
5. THE Theme_System SHALL `RARITY_COLOR` adlı bir nesne ihraç etmeli ve nadirlik seviyelerine karşılık gelen Color_Token değerlerini içermelidir.
6. WHEN bir UX_File kalite veya tier göstergesi oluşturduğunda, THE UX_File SHALL yalnızca `theme.ts`'den import edilen `QUALITY_BADGE`, `QUALITY_COLOR`, `TIER_LABEL`, `RARITY_BADGE` veya `RARITY_COLOR` nesnelerini kullanmalıdır.

---

### Gereksinim 5: Embed Builder Yardımcıları

**Kullanıcı Hikayesi:** Bir geliştirici olarak, standart başarı/hata/bilgi/uyarı embed'lerinin tek bir kaynaktan gelmesini istiyorum; böylece embed görünümü değişikliği için yalnızca `theme.ts` dosyasını düzenlemem yeterli olsun.

#### Kabul Kriterleri

1. THE Theme_System SHALL `successEmbed(title, description)` adlı bir Embed_Builder ihraç etmeli ve bu fonksiyon `COLORS.SUCCESS` rengiyle `✓ {title}` başlıklı bir `EmbedBuilder` döndürmelidir.
2. THE Theme_System SHALL `failEmbed(title, description)` adlı bir Embed_Builder ihraç etmeli ve bu fonksiyon `COLORS.DANGER` rengiyle `✗ {title}` başlıklı bir `EmbedBuilder` döndürmelidir.
3. THE Theme_System SHALL `infoEmbed(title, description)` adlı bir Embed_Builder ihraç etmeli ve bu fonksiyon `COLORS.PRIMARY` rengiyle bir `EmbedBuilder` döndürmelidir.
4. THE Theme_System SHALL `warningEmbed(title, description)` adlı bir Embed_Builder ihraç etmeli ve bu fonksiyon `COLORS.WARNING` rengiyle `⚠ {title}` başlıklı bir `EmbedBuilder` döndürmelidir.
5. WHEN `embed.ts` dosyası bir embed oluşturduğunda, THE embed.ts SHALL renk değerlerini `config`'den değil `theme.ts`'den import etmelidir.
6. THE Theme_System SHALL `successEmbed` ve `failEmbed` fonksiyonlarını hem `theme.ts` hem de `embed.ts` üzerinden aynı imzayla erişilebilir kılmalıdır; `embed.ts`'deki `QuickView` parametresi korunmalıdır.

---

### Gereksinim 6: Superscript Yardımcısı

**Kullanıcı Hikayesi:** Bir geliştirici olarak, envanter grid görünümündeki superscript sayı dönüşümünün tek bir kaynaktan gelmesini istiyorum; böylece format değişikliği için yalnızca `theme.ts` dosyasını düzenlemem yeterli olsun.

#### Kabul Kriterleri

1. THE Theme_System SHALL `toSuperscript(n)` adlı bir Format_Helper ihraç etmeli ve bu fonksiyon 0–99 arasındaki tam sayıları iki basamaklı superscript karakterlere dönüştürmelidir (örn. `6 → ⁰⁶`, `12 → ¹²`).
2. WHEN `inventory-ux.ts` superscript dönüşümüne ihtiyaç duyduğunda, THE inventory-ux.ts SHALL yalnızca `theme.ts`'den import edilen `toSuperscript` fonksiyonunu kullanmalıdır; yerel `toSuperscript` tanımı içermemelidir.
3. FOR ALL `toSuperscript` çağrılarında, WHEN girdi değeri 99'dan büyük verildiğinde, THE Theme_System SHALL `⁹⁹` döndürmelidir.
4. FOR ALL `toSuperscript` çağrılarında, WHEN girdi değeri 0 verildiğinde, THE Theme_System SHALL `⁰⁰` döndürmelidir.
5. FOR ALL geçerli `n` değerleri için, `toSuperscript(n)` çağrısının çıktısı parse edilip tekrar `toSuperscript` ile dönüştürüldüğünde aynı sonucu vermelidir (idempotence özelliği).

---

### Gereksinim 7: UX Dosyalarının Tema Sistemine Geçişi

**Kullanıcı Hikayesi:** Bir geliştirici olarak, tüm UX dosyalarının yerel tanımlar yerine `theme.ts`'i kullanmasını istiyorum; böylece kod tabanında Duplicate_Definition kalmasın.

#### Kabul Kriterleri

1. WHEN `stats-ux.ts` dosyası derlendiğinde, THE stats-ux.ts SHALL yerel `COLOR_NORMAL`, `COLOR_WARNING`, `COLOR_ELITE` sabitlerini içermemeli; bu değerleri `theme.ts`'den import etmelidir.
2. WHEN `stats-ux.ts` dosyası derlendiğinde, THE stats-ux.ts SHALL yerel `bar()` ve `statBar()` fonksiyonlarını içermemeli; `theme.ts`'den import edilen `hpBar()` veya eşdeğer Bar_Function'ı kullanmalıdır.
3. WHEN `stats-ux.ts` dosyası derlendiğinde, THE stats-ux.ts SHALL yerel `QUALITY_META`, `TIER_LABEL` tanımlarını içermemeli; `theme.ts`'den import edilen `QUALITY_BADGE`, `QUALITY_COLOR`, `TIER_LABEL` nesnelerini kullanmalıdır.
4. WHEN `inventory-ux.ts` dosyası derlendiğinde, THE inventory-ux.ts SHALL yerel `COLOR_INV`, `COLOR_BUFF`, `COLOR_EMPTY` sabitlerini içermemeli; bu değerleri `theme.ts`'den import etmelidir.
5. WHEN `inventory-ux.ts` dosyası derlendiğinde, THE inventory-ux.ts SHALL yerel `slotBar()`, `chargeBar()` fonksiyonlarını içermemeli; `theme.ts`'den import edilen eşdeğer Bar_Function'ları kullanmalıdır.
6. WHEN `inventory-ux.ts` dosyası derlendiğinde, THE inventory-ux.ts SHALL yerel `toSuperscript()` fonksiyonunu içermemeli; `theme.ts`'den import edilen `toSuperscript()` fonksiyonunu kullanmalıdır.
7. WHEN `upgrade-ux.ts` dosyası derlendiğinde, THE upgrade-ux.ts SHALL yerel `COLOR_PANEL`, `COLOR_SUCCESS`, `COLOR_FAIL`, `COLOR_CANCEL`, `COLOR_WARN` sabitlerini içermemeli; bu değerleri `theme.ts`'den import etmelidir.
8. WHEN `upgrade-ux.ts` dosyası derlendiğinde, THE upgrade-ux.ts SHALL yerel `bar()` ve `chanceBar()` fonksiyonlarını içermemeli; `theme.ts`'den import edilen eşdeğer Bar_Function'ları kullanmalıdır.
9. WHEN `pvp-ux.ts` dosyası derlendiğinde, THE pvp-ux.ts SHALL yerel `hpBar()` fonksiyonunu içermemeli; `theme.ts`'den import edilen `hpBarColored()` fonksiyonunu kullanmalıdır.
10. WHEN `hunt-ux.ts` dosyası derlendiğinde, THE hunt-ux.ts SHALL `pipeLine()` Format_Helper'ı `theme.ts`'den import ederek kullanmalıdır.
11. WHEN `embed.ts` dosyası derlendiğinde, THE embed.ts SHALL `COLOR_FAIL`, `COLOR_INFO`, `COLOR_SUCCESS`, `COLOR_WARNING` değerlerini `config`'den değil `theme.ts`'den import etmelidir.

---

### Gereksinim 8: Geriye Dönük Uyumluluk

**Kullanıcı Hikayesi:** Bir geliştirici olarak, tema geçişinin mevcut komut dosyalarını bozmadan tamamlanmasını istiyorum; böylece oyuncular geçiş sürecinde hata mesajı görmessin.

#### Kabul Kriterleri

1. WHEN tema geçişi tamamlandığında, THE Theme_System SHALL tüm mevcut Discord komutlarının (`hunt`, `stats`, `inventory`, `upgrade`, `pvp`, `duel`) önceki çıktılarıyla görsel olarak tutarlı çıktılar üretmelidir.
2. THE Theme_System SHALL `embed.ts` dosyasındaki `QuickView` arayüzünü ve `applyQuickView` fonksiyonunu değiştirmemelidir; bu API'yi kullanan komut dosyaları etkilenmemelidir.
3. IF bir UX_File `theme.ts`'den import edilen bir fonksiyonun imzasını değiştirirse, THEN THE Theme_System SHALL TypeScript derleme hatası üretmelidir.
4. WHILE tema geçişi devam ederken, THE Theme_System SHALL her UX_File'ın bağımsız olarak geçirilebilmesini sağlamalıdır; tüm dosyaların aynı anda değiştirilmesi zorunlu olmamalıdır.

---

### Gereksinim 9: Tek Kaynak Doğrulaması (Round-Trip)

**Kullanıcı Hikayesi:** Bir geliştirici olarak, `theme.ts`'deki bir renk veya format değişikliğinin tüm UX çıktılarına yansıdığını doğrulayabilmek istiyorum.

#### Kabul Kriterleri

1. THE Theme_System SHALL tüm Color_Token'ları `COLORS` nesnesi üzerinden ihraç etmeli; hiçbir Color_Token `COLORS` nesnesi dışında ayrı bir sabit olarak ihraç edilmemelidir.
2. FOR ALL Bar_Function'lar için, `theme.ts`'deki bar karakter setini (`█░` veya `▰▱`) değiştirmek, tüm UX_File çıktılarında ilgili barların otomatik olarak güncellenmesini sağlamalıdır.
3. THE Theme_System SHALL `COLORS`, `QUALITY_BADGE`, `QUALITY_COLOR`, `TIER_LABEL`, `RARITY_BADGE`, `RARITY_COLOR` nesnelerini `as const` ile ihraç etmeli; böylece TypeScript tip sistemi yanlış token kullanımını derleme zamanında tespit edebilmelidir.
4. FOR ALL `hpBar` ve `chargeBar` çağrıları için, `parse(format(x)) == x` round-trip özelliği geçerli olmalıdır: bar fonksiyonunun ürettiği karakter dizisindeki dolu segment sayısı, girdi oranından türetilen beklenen değerle eşleşmelidir.
