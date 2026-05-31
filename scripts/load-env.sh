#!/usr/bin/env bash
# load-env.sh — .env dosyasini guvenli yukler (& karakterli URL'ler icin)
# Kullanim: source scripts/load-env.sh

_ENV_FILE="${1:-.env}"

if [ ! -f "${_ENV_FILE}" ]; then
  echo "HATA: ${_ENV_FILE} bulunamadi" >&2
  return 1 2>/dev/null || exit 1
fi

while IFS= read -r line; do
  eval "$line"
done < <(node -e "
  const fs = require('fs');
  const dotenv = require('dotenv');
  const parsed = dotenv.parse(fs.readFileSync(process.argv[1], 'utf8'));
  for (const [k, v] of Object.entries(parsed)) {
    if (v !== undefined && v !== '') {
      process.stdout.write('export ' + k + '=' + JSON.stringify(v) + '\n');
    }
  }
" "${_ENV_FILE}")

unset _ENV_FILE
