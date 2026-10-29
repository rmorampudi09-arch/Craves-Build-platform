"""Training, export and evaluation of the travel-time model (README.md).

The model is scikit-learn's GradientBoostingRegressor with the absolute error loss: it predicts the median minutes a leg
takes, so a few very slow trips (a puncture, a wrong address) don't pull every estimate up. It is exported as plain JSON
trees, which Java evaluates exactly as scikit-learn does (predict below is that evaluation in numpy, and the tests hold it to
scikit-learn's own predictions). serve is what riders and chefs are then shown: the prediction kept within what a ride can
take, as EtaModel.minutes keeps it.

A version is published only if it is better than today's rule where it counts, on legs it never trained on (judge):
fewer minutes wrong on both legs, riders ranked in the right order at least as often, and as good on riders it never saw,
so it can't be learning who rides fast from where they wait.
"""
import csv
import json
import math
import random
from collections import Counter
from typing import NamedTuple

import numpy as np
from sklearn.ensemble import GradientBoostingRegressor

from . import __version__, features

FORMAT = 1
MIN_LEGS = 500
# Today's rule, the one to beat (FleetTripModels.estMinutes): about 20 km/h (333 m a minute) on the offer's distances, the
# pickup as the straight line times the detour and the drop by road. An export carries them (rule_metres); without them, the
# straight line times 1.4.
BASELINE_DETOUR = 1.4
BASELINE_METRES_PER_MINUTE = 333.0
# A leg is kept for training only if it looks like a real ride: 15 seconds to 120 minutes, at most 30 km, at most 60 km/h.
# Served predictions are kept within the same bounds (serve; EtaModel.minutes).
MIN_MINUTES, MAX_MINUTES, MAX_METRES, MAX_METRES_PER_MINUTE = 0.25, 120.0, 30_000.0, 1_000.0
PARAMS = dict(loss="absolute_error", n_estimators=200, max_depth=5, learning_rate=0.05, subsample=0.8, min_samples_leaf=20)
# Ranking: two pickup legs to the same kitchen (within 300 m), started within 2 hours of each other, whose real minutes
# differ by at least half a minute. The rider who really got there first should be ranked first.
PAIR_KITCHEN_METRES, PAIR_WINDOW_MS, PAIR_MIN_GAP_MINUTES, MIN_PAIRS = 300.0, 7_200_000, 0.5, 30
MIN_UNSEEN_PICKUPS = 20


class Leg(NamedTuple):
    """One leg of a trip, as training_data.sql exports it. group: the export's rider_group (-1: unknown). metres, bearing:
    between the exact ends (None: from the rounded coordinates). rule_metres: what today's rule used (None: 1.4 x straight)."""
    leg: int
    from_lat: float
    from_lng: float
    to_lat: float
    to_lng: float
    start_ms: int
    minutes: float
    rule_metres: float | None = None
    group: int = -1
    metres: float | None = None
    bearing_sin: float | None = None
    bearing_cos: float | None = None


def straight(leg):
    return leg.metres if leg.metres is not None else features.metres(leg.from_lat, leg.from_lng, leg.to_lat, leg.to_lng)


def baseline_minutes(metres):
    """Today's rule on the straight line alone (no export distances): 140% of it at 333 m a minute."""
    return metres * BASELINE_DETOUR / BASELINE_METRES_PER_MINUTE


def rule_minutes(legs):
    """Today's rule for each leg: the distance the offer used at 333 m a minute."""
    legs = [Leg(*leg) for leg in legs]
    return np.array([(leg.rule_metres if leg.rule_metres else straight(leg) * BASELINE_DETOUR) / BASELINE_METRES_PER_MINUTE
                     for leg in legs], dtype=np.float64)


def _optional(r, column, cast):
    text = (r.get(column) or "").strip()
    return cast(text) if text else None


def read_legs(path):
    """Legs from training_data.sql's CSV that look like real rides, oldest first, and how many were left out. Older exports
    (only leg, from_lat, from_lng, to_lat, to_lng, start_ms, minutes) still read."""
    legs, dropped = [], 0
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            try:
                group = _optional(r, "rider_group", int)
                leg = Leg(int(r["leg"]), float(r["from_lat"]), float(r["from_lng"]), float(r["to_lat"]), float(r["to_lng"]),
                          int(r["start_ms"]), float(r["minutes"]), _optional(r, "rule_metres", float),
                          -1 if group is None else group, _optional(r, "metres", float), _optional(r, "bearing_sin", float),
                          _optional(r, "bearing_cos", float))
            except (KeyError, TypeError, ValueError):
                dropped += 1
                continue
            if plausible(leg):
                legs.append(leg)
            else:
                dropped += 1
    legs.sort(key=lambda leg: leg.start_ms)
    return legs, dropped


def plausible(leg):
    if leg[0] not in (features.PICKUP, features.DROP) or not all(map(math.isfinite, leg[1:5])) or not math.isfinite(leg[6]):
        return False
    for v in (leg.rule_metres, leg.metres, leg.bearing_sin, leg.bearing_cos):
        if v is not None and not math.isfinite(v):
            return False
    m = straight(leg)
    return MIN_MINUTES <= leg[6] <= MAX_MINUTES and m <= MAX_METRES and m / leg[6] <= MAX_METRES_PER_MINUTE


def matrix(legs):
    rows = []
    for leg in legs:
        leg = Leg(*leg)
        bearing = None if leg.bearing_sin is None or leg.bearing_cos is None else (leg.bearing_sin, leg.bearing_cos)
        rows.append(features.row(leg.leg, leg.from_lat, leg.from_lng, leg.to_lat, leg.to_lng, leg.start_ms, leg.metres, bearing))
    x = np.array(rows, dtype=np.float64)
    y = np.array([leg[6] for leg in legs], dtype=np.float64)
    return x, y


def weights(legs):
    """Every rider counts once in each neighbourhood they set off from (about 1 km): a pickup leg weighs 1 / the rider's
    pickup legs from there. A rider who always waits at one spot then can't teach the model that the spot is slow or fast:
    it learns how fast the roads from there are for riders in general. Drop legs, and legs of unknown riders, weigh 1."""
    def cell(leg):
        return leg.group, round(leg.from_lat, 2), round(leg.from_lng, 2)
    pickups = Counter(cell(leg) for leg in map(lambda l: Leg(*l), legs) if leg.leg == features.PICKUP and leg.group >= 0)
    return np.array([1.0 / pickups[cell(leg)] if leg.leg == features.PICKUP and leg.group >= 0 else 1.0
                     for leg in map(lambda l: Leg(*l), legs)], dtype=np.float64)


def fit(x, y, seed=28, sample_weight=None, **overrides):
    return GradientBoostingRegressor(random_state=seed, **{**PARAMS, **overrides}).fit(x, y, sample_weight=sample_weight)


def export(gbr, version, metrics=None):
    """The model as JSON EtaModel.parse reads: each tree's nodes as parallel arrays, a leaf's children -1."""
    init = float(gbr.init_.predict(np.zeros((1, len(features.FEATURES)), dtype=np.float32)).astype(np.float64)[0])
    trees = []
    for stage in gbr.estimators_[:, 0]:
        t = stage.tree_
        trees.append({"feature": t.feature.tolist(), "threshold": t.threshold.tolist(), "left": t.children_left.tolist(),
                      "right": t.children_right.tolist(), "value": t.value[:, 0, 0].tolist()})
    return {"format": FORMAT, "version": version, "features": features.FEATURES, "init": init,
            "learning_rate": float(gbr.learning_rate), "trees": trees, "metrics": metrics or {}}


def predict(model, x, clamp=True):
    """EtaModel.predict in numpy: features as float32 against each split, then init plus each tree's leaf times the rate,
    added tree by tree in float64, as scikit-learn's predict_stages does. clamp: keep within 0 to 240 minutes, as Java does."""
    xf = np.asarray(x, dtype=np.float32).astype(np.float64)
    out = np.full(len(xf), float(model["init"]))
    rate = float(model["learning_rate"])
    for t in model["trees"]:
        feature, threshold = t["feature"], t["threshold"]
        left, right, value = t["left"], t["right"], t["value"]
        for i, row in enumerate(xf):
            node = 0
            while left[node] != -1:
                node = left[node] if row[feature[node]] <= threshold[node] else right[node]
            out[i] = out[i] + rate * value[node]
    return np.clip(out, 0.0, 240.0) if clamp else out


def serve(model, x):
    """The minutes shown and ranked by (EtaModel.minutes): the prediction, no faster than 60 km/h on the straight line and
    at most 120 minutes, the bounds of the legs it learnt from, so a place or hour it never saw can't produce a wild number."""
    x = np.asarray(x, dtype=np.float64)
    return np.minimum(MAX_MINUTES, np.maximum(x[:, 0] / MAX_METRES_PER_MINUTE, predict(model, x)))


def errors(y, p):
    e = np.abs(np.asarray(p) - np.asarray(y))
    return {"mae": round(float(e.mean()), 3), "p90": round(float(np.percentile(e, 90)), 3),
            "bias": round(float((np.asarray(p) - np.asarray(y)).mean()), 3)}


def concordance(legs, minutes):
    """Of the pairs of pickup legs to the same kitchen, started within 2 hours of each other, whose real minutes differ by at
    least half a minute: the share these minutes put in the right order, and how many pairs there were. That is how often
    ranking by them would offer the order first to the rider who really got there first."""
    picks = [(i, Leg(*leg)) for i, leg in enumerate(legs) if leg[0] == features.PICKUP]
    right = total = 0
    for a in range(len(picks)):
        i, li = picks[a]
        for b in range(a + 1, len(picks)):
            j, lj = picks[b]
            if abs(li.start_ms - lj.start_ms) > PAIR_WINDOW_MS or abs(li.minutes - lj.minutes) < PAIR_MIN_GAP_MINUTES:
                continue
            if features.metres(li.to_lat, li.to_lng, lj.to_lat, lj.to_lng) > PAIR_KITCHEN_METRES:
                continue
            total += 1
            if (minutes[i] - minutes[j]) * (li.minutes - lj.minutes) > 0:
                right += 1
    return (round(right / total, 3) if total else None), total


def report(legs, model):
    """Minutes wrong (MAE, 90th percentile, bias), the model's and today's rule's, overall and per leg, and for the pickup leg
    how often each ranks two riders in the right order."""
    x, y = matrix(legs)
    p = serve(model, x)
    base = rule_minutes(legs)
    out = {"legs": len(legs), "model": errors(y, p), "today": errors(y, base)}
    for kind, name in ((features.PICKUP, "pickup"), (features.DROP, "drop")):
        mask = x[:, 9] == kind
        if mask.any():
            out[name] = {"legs": int(mask.sum()), "model": errors(y[mask], p[mask]), "today": errors(y[mask], base[mask])}
    model_order, pairs = concordance(legs, p)
    today_order, _ = concordance(legs, base)
    out["ranking"] = {"pairs": pairs, "model": model_order, "today": today_order}
    return out


def judge(test, unseen, riders_known):
    """(verdict, ranking, why), from legs the model never trained on.
    verdict: better when its minutes beat today's rule on the pickup leg and on the drop leg, and, when the export knows
    riders (at least 5 are needed to hold some out), on riders it never saw. Only such a version is published: its minutes
    are what offers and chefs are shown.
    ranking: better when it puts riders in the right order at least as often as today's rule does (at least MIN_PAIRS
    pairs). Minutes can be better on average without ranking any better, so only a version better at both may decide who
    hears of an order first (FleetEta.ranks)."""
    why = []
    for name in ("pickup", "drop"):
        leg = test.get(name)
        if leg is None:
            return "too-few", "too-few", [f"no {name} legs among the newest"]
        if leg["model"]["mae"] >= leg["today"]["mae"]:
            why.append(f"{name}: {leg['model']['mae']} minutes wrong on average against today's {leg['today']['mae']}")
    verdict = "worse" if why else "better"
    if riders_known and unseen is None:
        verdict, why = "too-few", why + ["fewer than 5 riders: the model can't be checked on riders it never saw"]
    elif unseen is not None:
        pick = unseen.get("pickup")
        if pick is None or pick["legs"] < MIN_UNSEEN_PICKUPS:
            verdict, why = "too-few", why + [f"fewer than {MIN_UNSEEN_PICKUPS} pickup legs from riders held out of training"]
        elif pick["model"]["mae"] >= pick["today"]["mae"]:
            verdict = "worse"
            why.append(f"riders it never saw: {pick['model']['mae']} pickup minutes wrong against today's {pick['today']['mae']}")
    ranking = test["ranking"]
    if ranking["pairs"] < MIN_PAIRS:
        order = "too-few"
        why.append(f"ranking: {ranking['pairs']} pairs of riders to one kitchen, at least {MIN_PAIRS} are needed to judge it")
    elif ranking["model"] < ranking["today"]:
        order = "not-better"
        why.append(f"ranking: right {ranking['model']:.1%} of the time against today's {ranking['today']:.1%}")
    else:
        order = "better"
    return verdict, order, why


def train(legs, version, seed=28, test_fraction=0.2, unseen_fraction=0.2, data_sha256=None):
    """Holds out a fifth of the riders entirely (when the export knows riders) and the newest fifth of the other riders'
    legs, trains on the rest, rider-balanced (weights), and judges the model on what it never saw. The model returned is the
    one judged: it isn't trained again on everything. Returns (model JSON, test report with its verdict)."""
    legs = [Leg(*leg) for leg in legs]
    if len(legs) < MIN_LEGS:
        raise ValueError(f"{len(legs)} legs: at least {MIN_LEGS} are needed before a model can beat today's rule fairly")
    groups = sorted({leg.group for leg in legs if leg.group >= 0})
    unseen_groups = set(random.Random(seed).sample(groups, max(1, round(len(groups) * unseen_fraction)))) if len(groups) >= 5 else set()
    seen = [leg for leg in legs if leg.group not in unseen_groups]
    unseen = [leg for leg in legs if leg.group in unseen_groups]
    cut = int(len(seen) * (1 - test_fraction))
    learn, newest = seen[:cut], seen[cut:]
    x, y = matrix(learn)
    built = export(fit(x, y, seed=seed, sample_weight=weights(learn)), version)
    test = report(newest, built)
    unseen_report = report(unseen, built) if unseen else None
    if unseen_report is not None:
        test["unseenRiders"] = unseen_report
    elif not groups:
        test["unseenRiders"] = "not checked: this export has no rider groups"
    test["verdict"], test["rankingVerdict"], test["why"] = judge(test, unseen_report, bool(groups))
    built["metrics"] = {
        "code": __version__, "dataSha256": data_sha256, "params": PARAMS, "trainLegs": len(learn), "testLegs": len(newest),
        "unseenRiderLegs": len(unseen), "riders": len(groups), "fromMs": legs[0].start_ms, "trainedThroughMs": learn[-1].start_ms,
        "testedThroughMs": max(leg.start_ms for leg in legs), "heldOutTest": test}
    return built, test


def publish_sql(model):
    """The SQL a person runs to make the version available to integration-service (README.md, step 4). Only a version judged
    better is published. Running it again changes nothing; a different model under a version already taken is refused."""
    verdict = model.get("metrics", {}).get("heldOutTest", {}).get("verdict")
    if verdict != "better":
        raise ValueError(f"version {model.get('version')} was judged {verdict or 'never'}: only a version that beats today's rule is published")
    body = json.dumps(model, separators=(",", ":"))
    metrics = json.dumps(model.get("metrics", {}), separators=(",", ":"))
    tag = "eta_model"
    if any(t in body or t in metrics for t in (f"${tag}$", "$check$")):
        raise ValueError("the model text contains an SQL quote tag")
    version = model["version"]
    return (f"INSERT INTO fleet_schema.eta_model (version, model, metrics)\n"
            f"VALUES ('{version}', ${tag}${body}${tag}$::jsonb, ${tag}${metrics}${tag}$::jsonb)\n"
            f"ON CONFLICT (version) DO NOTHING;\n"
            f"DO $check$ BEGIN\n"
            f"  IF NOT EXISTS (SELECT 1 FROM fleet_schema.eta_model WHERE version = '{version}' AND model = ${tag}${body}${tag}$::jsonb) THEN\n"
            f"    RAISE EXCEPTION 'eta_model version {version} already holds another model: publish this one under a new version';\n"
            f"  END IF;\n"
            f"END $check$;\n")
