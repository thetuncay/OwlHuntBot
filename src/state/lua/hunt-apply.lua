-- hunt-apply.lua — Atomik oyuncu alan guncelleme (Redis-first hunt hot path)
-- KEYS[1] = state:player:{id}
-- ARGV[1] = yeni player JSON

local current = redis.call('GET', KEYS[1])
if not current then
  return redis.error_reply('NO_PLAYER')
end
redis.call('SET', KEYS[1], ARGV[1])
return 1
