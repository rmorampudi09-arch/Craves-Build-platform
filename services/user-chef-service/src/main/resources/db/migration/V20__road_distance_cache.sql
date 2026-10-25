-- PLAN F6: Ola road distance per kitchen-address pair (rider drop pay), reused for 30 days while
-- neither point moves. A key is the kitchen or address id, or the rounded "lat,lng" when no id is sent.
-- Only Ola answers are stored; a straight-line fallback is never cached, so the next call retries Ola.
SET LOCAL lock_timeout = '5s';

CREATE TABLE road_distance_cache (
    origin_key      VARCHAR(64)  NOT NULL,
    destination_key VARCHAR(64)  NOT NULL,
    origin_lat      NUMERIC(6,4) NOT NULL,
    origin_lng      NUMERIC(7,4) NOT NULL,
    destination_lat NUMERIC(6,4) NOT NULL,
    destination_lng NUMERIC(7,4) NOT NULL,
    meters          INTEGER      NOT NULL CHECK (meters >= 0),
    seconds         INTEGER      CHECK (seconds >= 0),
    source          VARCHAR(16)  NOT NULL,
    fetched_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT pk_road_distance_cache PRIMARY KEY (origin_key, destination_key)
);
