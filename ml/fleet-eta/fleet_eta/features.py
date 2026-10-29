"""The travel-time model's features, computed exactly as EtaModel.features computes them in Java (services/fleet-engine and
integration-service, in.craves...eta.EtaModel): the same formulas in the same order, so both sides feed the trees the
same numbers. Any change here is a change there; testdata/golden.json and EtaModelTest check both."""
import math

FEATURES = ["metres", "from_lat", "from_lng", "to_lat", "to_lng", "bearing_sin", "bearing_cos", "ist_hour", "ist_weekday", "leg"]
PICKUP = 0  # the rider to the kitchen
DROP = 1  # the kitchen to the customer
IST_OFFSET_MS = 19_800_000
DAY_MS = 86_400_000
HOUR_MS = 3_600_000


def metres(lat1, lng1, lat2, lng2):
    """RoadDistanceClient.straightLineMetres: haversine on a 6,371 km sphere, operation for operation."""
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    return 2 * 6_371_000 * math.asin(min(1, math.sqrt(a)))


def ist_hour_weekday(at_ms):
    """The IST hour (0-23) and weekday (0 Monday to 6 Sunday) at epoch milliseconds at_ms; 1 Jan 1970 was a Thursday."""
    ist = at_ms + IST_OFFSET_MS
    return (ist % DAY_MS) // HOUR_MS, (ist // DAY_MS + 3) % 7


def row(leg, from_lat, from_lng, to_lat, to_lng, at_ms, exact_metres=None, exact_bearing=None):
    """One row of FEATURES, as EtaModel.features. A training export rounds both ends to about 110 m, so it also carries the
    distance and the bearing (sin, cos) between the exact ends, computed in SQL by the same formulas: those are used then,
    so a short ride's distance and direction aren't blurred by the rounding."""
    d_lng = math.radians(to_lng - from_lng)
    phi1 = math.radians(from_lat)
    phi2 = math.radians(to_lat)
    bearing = math.atan2(math.sin(d_lng) * math.cos(phi2),
                         math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(d_lng))
    b_sin, b_cos = (math.sin(bearing), math.cos(bearing)) if exact_bearing is None else exact_bearing
    hour, weekday = ist_hour_weekday(int(at_ms))
    m = metres(from_lat, from_lng, to_lat, to_lng) if exact_metres is None else float(exact_metres)
    return [m, float(from_lat), float(from_lng), float(to_lat), float(to_lng), b_sin, b_cos, float(hour), float(weekday), float(leg)]
