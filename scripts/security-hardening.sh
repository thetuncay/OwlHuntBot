#!/usr/bin/env bash
# OwlHuntBot VDS güvenlik sertleştirme — tekrar çalıştırılabilir
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  # shellcheck disable=SC1091
  set -a && source "$ROOT/.env" && set +a
fi

echo "[security] UFW firewall..."
ufw --force reset >/dev/null 2>&1 || true
ufw default deny incoming
ufw default allow outgoing
# SSH — sadece bilinen admin IP'leri (genel 22/tcp kapali)
ufw allow from 31.223.10.247 to any port 22 proto tcp comment 'SSH admin'
ufw allow from 95.70.218.47 to any port 22 proto tcp comment 'SSH admin alt'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
# Port 3000 (Gardiyan uptime) localhost only — UFW ile acilmaz
ufw deny 3000/tcp comment 'Block Gardiyan public' >/dev/null 2>&1 || true
# DB/Redis — dışarıdan erişim yasak (docker yanlışlıkla 0.0.0.0 açarsa da)
for port in 5432 6432 6379 6380 27017 3306 3010 3011; do
  ufw deny "$port/tcp" comment "Block DB/cache $port" >/dev/null 2>&1 || true
done
ufw --force enable
ufw status verbose

echo "[security] Docker DOCKER-USER — DB portları dış arayüzden blok..."
EXT_IF="$(ip -4 route show default 2>/dev/null | awk '{print $5; exit}')"
if [[ -n "$EXT_IF" ]] && iptables -L DOCKER-USER -n &>/dev/null; then
  for port in 5432 6432 6379 6380; do
    iptables -C DOCKER-USER -i "$EXT_IF" -p tcp --dport "$port" -j DROP 2>/dev/null \
      || iptables -I DOCKER-USER -i "$EXT_IF" -p tcp --dport "$port" -j DROP
  done
  iptables -C DOCKER-USER -j RETURN 2>/dev/null || iptables -A DOCKER-USER -j RETURN
  echo "  DOCKER-USER kuralları eklendi (iface=$EXT_IF)"
fi

echo "[security] fail2ban (sshd)..."
if ! command -v fail2ban-client &>/dev/null; then
  apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq fail2ban
fi
install -m 0644 "$ROOT/scripts/fail2ban-jail.local" /etc/fail2ban/jail.local
systemctl enable fail2ban
systemctl restart fail2ban
fail2ban-client status sshd 2>/dev/null || fail2ban-client status

echo "[security] PostgreSQL bağlantı logları için container yenile..."
docker compose up -d postgres pgbouncer

echo "[security] Tamamlandı."
