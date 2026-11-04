-- Chef-side account deletion (30 days after the request) anonymises the person's chef_application row in place
-- and sets erased_at. The row, its id and its KYC documents stay; if the person applies again, the same row is reset
-- to a fresh draft and erased_at is cleared. Additive and nullable: existing rows read as "not erased".
SET LOCAL lock_timeout = '5s';

ALTER TABLE chef_application ADD COLUMN erased_at TIMESTAMPTZ;
