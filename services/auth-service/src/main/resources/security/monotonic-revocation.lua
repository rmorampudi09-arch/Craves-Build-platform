-- A delayed retry must never lower the accepted account version. Compare decimal
-- strings, not Lua floating-point numbers: Java token versions are signed int64.
local status, version, ttl = ARGV[1], ARGV[2], tonumber(ARGV[3])
if (status ~= 'ACTIVE' and status ~= 'SUSPENDED') or not string.match(version, '^[1-9][0-9]*$') or not ttl or ttl < 1 then
  return -1
end
local current = redis.call('GET', KEYS[1])
if current then
  local oldStatus, oldVersion = string.match(current, '^([A-Z_]+)|([1-9][0-9]*)$')
  if not oldVersion or (oldStatus ~= 'ACTIVE' and oldStatus ~= 'SUSPENDED') then return -1 end
  if #oldVersion > #version or (#oldVersion == #version and oldVersion > version) then return 0 end
  if oldVersion == version and oldStatus ~= status then
    -- Conflicting same-version facts must never restore access. A subsequent
    -- authoritative version is required to clear this restriction.
    redis.call('SET', KEYS[1], 'SUSPENDED|' .. version, 'EX', math.max(ttl, redis.call('TTL', KEYS[1])))
    return -1
  end
  ttl = math.max(ttl, redis.call('TTL', KEYS[1]))
end
redis.call('SET', KEYS[1], status .. '|' .. version, 'EX', ttl)
return 1
