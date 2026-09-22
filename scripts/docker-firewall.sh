#!/usr/bin/env bash
# Docker published portları UFW'yi bypass edebilir — DB portlarını dışarıdan kes
set -euo pipefail
EXT_IF="$(ip -4 route show default 2>/dev/null | awk '{print $5; exit}')"
[[ -z "$EXT_IF" ]] && exit 0
iptables -L DOCKER-USER -n &>/dev/null || exit 0
for port in 5432 6432 6379 6380; do
  iptables -C DOCKER-USER -i "$EXT_IF" -p tcp --dport "$port" -j DROP 2>/dev/null \
    || iptables -I DOCKER-USER -i "$EXT_IF" -p tcp --dport "$port" -j DROP
done
iptables -C DOCKER-USER -j RETURN 2>/dev/null || iptables -A DOCKER-USER -j RETURN
