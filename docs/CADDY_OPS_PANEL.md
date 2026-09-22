# Ops panel + public site — Caddy reverse proxy

PM2 process `owlhuntbot-ops-panel` listens on **127.0.0.1:3011** only (not public). Caddy terminates HTTPS and proxies to it.

## Caddyfile

```caddyfile
owlhunt.thetuncay.com {
    reverse_proxy 127.0.0.1:3011
}
```

After editing `/etc/caddy/Caddyfile`:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

**Important:** Caddy does not reload automatically when you edit the file. If the browser still shows the default [Caddy welcome page](https://caddyserver.com/docs/), run `reload` — the on-disk config can include `owlhunt` while the running process does not.

## URLs

| URL | Purpose |
|-----|---------|
| `https://owlhunt.thetuncay.com/` | Public landing (bot invite) |
| `https://owlhunt.thetuncay.com/admin` | Ops / admin panel |
| `https://owlhunt.thetuncay.com/api/public/config` | Invite URL + guild count |
| `https://owlhunt.thetuncay.com/api/health` | Health JSON |
| `https://owlhunt.thetuncay.com/api/guilds` | Guild directory (admin UI) |

Use **HTTPS**. Plain `http://` redirects to HTTPS for named hosts.

## PM2

```bash
pnpm build
pm2 restart owlhuntbot-ops-panel
pm2 list   # owlhuntbot-ops-panel → online
curl -s http://127.0.0.1:3011/api/public/config | head
```

`.env`: `OPS_PANEL_PORT=3011`, `OPS_PANEL_ENABLED=1`, `PUBLIC_SITE_ENABLED=1` (defaults on).

Optional: `SUPPORT_SERVER_URL`, `PUBLIC_BOT_NAME`, `DISCORD_INVITE_PERMISSIONS`.

## Security

`/admin`, `/api/guilds`, `/api/health` require **HTTP Basic Auth** (browser login prompt).

Set in `.env`:

```env
OPS_PANEL_USERNAME=admin
OPS_PANEL_PASSWORD=your-strong-password
```

Then:

```bash
pnpm build
pm2 restart owlhuntbot-ops-panel
```

Production without these vars returns **503** on admin routes. Landing (`/`) stays public.

Optional extra layer — Caddy basic auth on `/admin*` only (redundant if app auth is set).

## DNS

`owlhunt.thetuncay.com` A record → VDS public IP.
