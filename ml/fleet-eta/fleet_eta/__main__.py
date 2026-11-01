"""python -m fleet_eta train | evaluate | sql | golden (README.md)."""
import argparse
import hashlib
import json
import pathlib
import re
import sys

import numpy as np

from . import features, model, synthetic

VERSION = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def main(argv=None):
    p = argparse.ArgumentParser(prog="fleet_eta", description="Craves's travel-time model (ml/fleet-eta/README.md)")
    sub = p.add_subparsers(dest="command", required=True)
    t = sub.add_parser("train", help="train on legs.csv; writes --out only for a version that beats today's rule (exit 0); "
                       "exit 1 when it doesn't, 2 when there is too little data to judge")
    t.add_argument("--legs", required=True)
    t.add_argument("--version", required=True, help="eta-YYYYMMDD-a: letters, digits, '.', '_' or '-', at most 64")
    t.add_argument("--out", required=True)
    e = sub.add_parser("evaluate", help="the model against today's rule on the legs of legs.csv newer than any it saw")
    e.add_argument("--legs", required=True)
    e.add_argument("--model", required=True)
    s = sub.add_parser("sql", help="the SQL that makes a version available to integration-service (only one judged better)")
    s.add_argument("--model", required=True)
    g = sub.add_parser("golden", help="rewrite testdata/golden.json, which the Java EtaModelTests read")
    g.add_argument("--out", default=str(pathlib.Path(__file__).resolve().parents[1] / "testdata" / "golden.json"))
    args = p.parse_args(argv)

    if args.command == "train":
        if not VERSION.match(args.version):
            p.error("--version: 1 to 64 letters, digits, '.', '_' or '-'")
        legs, dropped = model.read_legs(args.legs)
        sha = hashlib.sha256(pathlib.Path(args.legs).read_bytes()).hexdigest()
        try:
            built, test = model.train(legs, args.version, data_sha256=sha)
        except ValueError as e:
            print(f"FLEET_ETA_NOT_TRAINED {e}", file=sys.stderr)
            return 2
        print(json.dumps({"version": args.version, "legs": len(legs), "leftOut": dropped, "heldOutTest": test}, indent=2))
        print(f"FLEET_ETA_VERDICT minutes={test['verdict']} ranking={test['rankingVerdict']}", file=sys.stderr)
        if test["verdict"] == "too-few":
            print("FLEET_ETA_TOO_FEW: not enough data to judge it yet; nothing written", file=sys.stderr)
            return 2
        if test["verdict"] != "better":
            print("FLEET_ETA_NOT_BETTER: keep today's rule; nothing written", file=sys.stderr)
            return 1
        pathlib.Path(args.out).write_text(json.dumps(built, separators=(",", ":")), encoding="utf-8")
        return 0
    if args.command == "evaluate":
        legs, dropped = model.read_legs(args.legs)
        m = load(args.model)
        seen_through = m.get("metrics", {}).get("testedThroughMs")
        newer = [leg for leg in legs if seen_through is None or leg.start_ms > seen_through]
        if not newer:
            print(f"FLEET_ETA_NOTHING_NEW: every leg in {args.legs} is from before {seen_through}, which this version saw", file=sys.stderr)
            return 2
        out = model.report(newer, m)
        out["leftOut"] = dropped
        out["seenBefore"] = len(legs) - len(newer)
        print(json.dumps(out, indent=2))
        return 0
    if args.command == "sql":
        try:
            sys.stdout.write(model.publish_sql(load(args.model)))
        except ValueError as e:
            print(f"FLEET_ETA_NOT_PUBLISHED {e}", file=sys.stderr)
            return 1
        return 0
    write_golden(pathlib.Path(args.out))
    return 0


def load(path):
    try:
        m = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise SystemExit(f"{path}: {e}")
    if m.get("format") != model.FORMAT or m.get("features") != features.FEATURES or not VERSION.match(str(m.get("version", ""))):
        raise SystemExit(f"{path} is not a fleet_eta model of format {model.FORMAT}")
    return m


def write_golden(path):
    """A small model trained on synthetic legs, and rows Java must predict exactly as scikit-learn does: their inputs, the
    features Python computes from them, and scikit-learn's own prediction for each."""
    legs = synthetic.legs(3_000, seed=28)
    x, y = model.matrix(legs)
    gbr = model.fit(x, y, seed=28, n_estimators=60)  # the production depth, fewer trees: a smaller file proves the same
    built = model.export(gbr, "golden-1", {"note": "synthetic legs only (fleet_eta/synthetic.py)"})
    probes = synthetic.legs(200, seed=29) + [
        (features.PICKUP, 17.4483, 78.3915, 17.4483, 78.3915, 1793160000000, 0),  # the same point, 09:30 IST
        (features.DROP, 17.4483, 78.3915, 17.46, 78.36, 1793125800000, 0),  # IST midnight
        (features.DROP, 17.385, 78.4867, 17.4401, 78.3489, 1793557799999, 0),  # Sunday 23:59
        (features.PICKUP, 17.30, 78.30, 17.55, 78.60, 1790000000000, 0),  # across the city
    ]
    rows = []
    for leg in probes:
        f = features.row(leg[0], leg[1], leg[2], leg[3], leg[4], leg[5])
        sk = float(gbr.predict(np.array([f]))[0])
        mine = float(model.predict(built, [f], clamp=False)[0])
        if sk != mine:
            raise SystemExit(f"the numpy evaluation differs from scikit-learn: {mine} != {sk}")
        rows.append({"leg": leg[0], "fromLat": leg[1], "fromLng": leg[2], "toLat": leg[3], "toLng": leg[4], "atMs": leg[5],
                     "features": f, "minutes": sk})
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"model": built, "rows": rows}, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{path}: {len(built['trees'])} trees, {sum(len(t['value']) for t in built['trees'])} nodes, {len(rows)} rows")


if __name__ == "__main__":
    sys.exit(main())
