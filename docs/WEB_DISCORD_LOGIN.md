# Web — Discord hesap bağlama (klasik bot tarzı login)

Kullanıcılar sitede **Discord ile giriş** yapar; Discord user ID = bot `Player.id` (ayrı bağlama tablosu gerekmez).

## URL’ler

| URL | Açıklama |
|-----|----------|
| `/login` | Giriş sayfası |
| `/api/auth/discord/login` | OAuth başlat |
| `/dashboard` | Bağlı profil (coin, level, baykuş) |
| `/admin` | Ops panel (HTTP Basic Auth — ayrı sistem) |

## Discord Developer Portal

1. [Discord Developer Portal](https://discord.com/developers/applications) → uygulamanız → **OAuth2**
2. **Redirects** ekle:
   ```text
   https://owlhunt.thetuncay.com/api/auth/discord/redirect
   https://owlhunt.thetuncay.com/api/auth/discord/linked-role/callback
   ```
3. **Client Secret** kopyala → `.env`:

```env
DISCORD_CLIENT_SECRET=...
WEB_PUBLIC_URL=https://owlhunt.thetuncay.com
WEB_SESSION_SECRET=...   # openssl rand -base64 32
DISCORD_PUBLIC_KEY=...   # General Information → Public Key
```

Scopes (varsayılan web login): `identify email` — Linked Roles için ayrıca `role_connections.write` kullanılır.

## Developer Portal — 4 URL alanı

`WEB_PUBLIC_URL` = `https://owlhunt.thetuncay.com`:

| Portal alanı | URL | Discord ne bekler |
|--------------|-----|-------------------|
| **Interactions Endpoint URL** | `/api/interactions` | `POST` + Ed25519 imza. PING (`type:1`) → PONG (`type:1`). Bot Gateway kullandığı için sadece doğrulama yeterli. |
| **Linked Roles Verification URL** | `/verify-user` | **HTML sayfa** (200 OK). Kullanıcı Discord’dan gelince OAuth başlatır; metadata Discord API’ye `PUT /users/@me/applications/{id}/role-connection` ile gider. JSON `?user_id=` API değil. |
| **Terms of Service URL** | `/terms-of-service` | Herkese açık **Hizmet Koşulları** sayfası (HTML). |
| **Privacy Policy URL** | `/privacy-policy` | Herkese açık **Gizlilik Politikası** sayfası (HTML). |

### Linked Roles kurulumu (tek sefer)

Metadata şemasını Discord’a kaydet:

```bash
pnpm tsx scripts/register-linked-roles-metadata.ts
```

Portal metadata anahtarları: `level`, `hunts`, `power`, `registered`.

Akış: Discord → `/verify-user` → **Discord ile bağlan** → OAuth → callback → istatistikler Discord’a yazılır.

## Deploy

```bash
pnpm build
pm2 restart owlhuntbot-ops-panel
```

## Akış

1. Kullanıcı **Giriş Yap** → Discord authorize
2. Callback → oturum çerezi (7 gün)
3. `/dashboard` → PostgreSQL’den oyuncu verisi (kayıtlı değilse “Discord’da oyuna kayıt ol” mesajı)

Bot daveti (`Sunucuya Ekle`) ile web login **farklı** OAuth akışlarıdır.
