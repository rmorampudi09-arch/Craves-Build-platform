"""Synthetic Hyderabad-like legs for tests and the golden file: no real trip, rider or customer is in them. Slower in the
morning and evening rush, slower in the old city and across the lake, a few minutes to park at the kitchen or find the
door, and some noise."""
import random

from . import features

START_MS = 1_790_000_000_000  # Sep 2026


def legs(n, seed=28):
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        leg = rnd.choice((features.PICKUP, features.DROP))
        from_lat, from_lng = rnd.uniform(17.30, 17.55), rnd.uniform(78.30, 78.60)
        to_lat = from_lat + rnd.uniform(-0.06, 0.06)
        to_lng = from_lng + rnd.uniform(-0.06, 0.06)
        start_ms = START_MS + rnd.randrange(0, 28 * features.DAY_MS)
        out.append((leg, from_lat, from_lng, to_lat, to_lng, start_ms, minutes(rnd, leg, from_lat, from_lng, to_lat, to_lng, start_ms)))
    out.sort(key=lambda leg: leg[5])
    return out


def minutes(rnd, leg, from_lat, from_lng, to_lat, to_lng, start_ms):
    hour, weekday = features.ist_hour_weekday(start_ms)
    kmh = 22.0
    if hour in (8, 9, 10, 17, 18, 19, 20) and weekday < 5:
        kmh = 13.0
    if to_lat < 17.37:  # the old city
        kmh *= 0.8
    m = features.metres(from_lat, from_lng, to_lat, to_lng) * (1.45 if from_lng < 78.45 < to_lng or to_lng < 78.45 < from_lng else 1.25)
    park = 2.0 if leg == features.PICKUP else 3.5
    return round(max(1.0, m / (kmh * 1000 / 60) + park + rnd.gauss(0, 1.2)), 3)


KITCHENS = [(17.4483, 78.3915), (17.4401, 78.3489), (17.4239, 78.4483), (17.4126, 78.4071), (17.3850, 78.4867),
            (17.4948, 78.3996), (17.4569, 78.3700), (17.4062, 78.5487)]


def fleet(n, seed=28, riders=12, slow_rider_spot=None):
    """Legs as a pilot fleet makes them, with rider groups (0..riders-1): pickups from near each rider's usual waiting spot
    to one of a few kitchens, drops from a kitchen to a customer, the distances today's rule would use, and the exact
    distance and bearing as an export carries them. slow_rider_spot: rider 0 always waits at that spot and rides 40% slower,
    which a model must not learn as a fact about the spot."""
    rnd = random.Random(seed)
    spots = [(rnd.uniform(17.37, 17.50), rnd.uniform(78.34, 78.55)) for _ in range(riders)]
    if slow_rider_spot is not None:
        spots[0] = slow_rider_spot
    out = []
    for i in range(n):
        rider = rnd.randrange(riders)
        k_lat, k_lng = rnd.choice(KITCHENS)
        start_ms = START_MS + rnd.randrange(0, 28 * features.DAY_MS)
        if rnd.random() < 0.5:
            s_lat, s_lng = spots[rider]
            from_lat, from_lng = s_lat + rnd.gauss(0, 0.003), s_lng + rnd.gauss(0, 0.003)
            if slow_rider_spot is not None and rider == 0:
                from_lat, from_lng = s_lat, s_lng
            leg, to_lat, to_lng = features.PICKUP, k_lat, k_lng
            rule = features.metres(from_lat, from_lng, to_lat, to_lng) * 1.3
        else:
            leg, from_lat, from_lng = features.DROP, k_lat, k_lng
            to_lat, to_lng = k_lat + rnd.uniform(-0.04, 0.04), k_lng + rnd.uniform(-0.04, 0.04)
            rule = features.metres(from_lat, from_lng, to_lat, to_lng) * 1.25
        m = minutes(rnd, leg, from_lat, from_lng, to_lat, to_lng, start_ms)
        if slow_rider_spot is not None and rider == 0 and leg == features.PICKUP:
            m = round(m * 1.4, 3)
        row = features.row(leg, from_lat, from_lng, to_lat, to_lng, start_ms)
        out.append((leg, round(from_lat, 3), round(from_lng, 3), round(to_lat, 3), round(to_lng, 3), start_ms - start_ms % 900_000,
                    m, rule, rider, row[0], row[5], row[6]))
    out.sort(key=lambda leg: leg[5])
    return out
