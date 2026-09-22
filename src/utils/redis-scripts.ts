/** Atomic DECR that never goes below zero. */
export const SAFE_DECR_SCRIPT = `
local value = redis.call("decr", KEYS[1])
if value < 0 then
  redis.call("set", KEYS[1], 0)
  return 0
end
return value
`;

/** INCR with EXPIRE set only when key is first created. */
export const INCR_EXPIRE_SCRIPT = `
local value = redis.call("INCR", KEYS[1])
if value == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return value
`;
