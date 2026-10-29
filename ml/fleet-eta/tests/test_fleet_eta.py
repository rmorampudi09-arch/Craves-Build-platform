"""python -m unittest discover -s tests (from ml/fleet-eta)."""
import collections
import csv
import json
import pathlib
import random
import statistics
import struct
import tempfile
import unittest

import numpy as np

import fleet_eta
from fleet_eta import __main__ as cli
from fleet_eta import features, model, synthetic

GOLDEN = pathlib.Path(__file__).resolve().parents[1] / "testdata" / "golden.json"


def bits(x):
    return struct.unpack(">Q", struct.pack(">d", x))[0]


class FeaturesTest(unittest.TestCase):
    def test_metres_are_integration_services_to_the_bit(self):
        # RoadDistanceClient.straightLineMetres on Java 21 (services/fleet-engine GeoTest pins the same bits).
        self.assertEqual(bits(features.metres(17.4483, 78.3915, 17.4486, 78.3908)), 0x405459d8d94598e2)
        self.assertEqual(bits(features.metres(17.4483, 78.3915, 17.46, 78.36)), 0x40ac036a39c0b9d6)
        self.assertEqual(bits(features.metres(17.385, 78.4867, 17.4401, 78.3489)), 0x40cef62d1963e1e3)
        self.assertEqual(features.metres(17.4483, 78.3915, 17.4483, 78.3915), 0.0)

    def test_hours_and_weekdays_are_indian_standard_time(self):
        self.assertEqual(features.ist_hour_weekday(1793160000000), (9, 2))  # Wed 28 Oct 2026, 09:30 IST
        self.assertEqual(features.ist_hour_weekday(1793125800000), (0, 2))  # its midnight
        self.assertEqual(features.ist_hour_weekday(1793125799999), (23, 1))
        self.assertEqual(features.ist_hour_weekday(1793557799999)[1], 6)  # a Sunday

    def test_a_row_has_every_feature_in_order(self):
        r = features.row(features.DROP, 17.0, 78.0, 17.1, 78.0, 1793160000000)
        self.assertEqual(len(r), len(features.FEATURES))
        self.assertAlmostEqual(r[6], 1.0)  # due north
        self.assertEqual(r[7:], [9.0, 2.0, 1.0])


class ModelTest(unittest.TestCase):
    def test_the_numpy_evaluation_is_scikit_learns_to_the_bit(self):
        x, y = model.matrix(synthetic.legs(800, seed=3))
        gbr = model.fit(x, y, n_estimators=25)
        exported = model.export(gbr, "t")
        np.testing.assert_array_equal(model.predict(exported, x, clamp=False), gbr.predict(x))
        for t in exported["trees"]:  # EtaModel.parse's safety rule: children come after their parent
            for i, (l, r) in enumerate(zip(t["left"], t["right"])):
                self.assertTrue((l == r == -1) or (l > i and r > i))

    def test_training_judges_the_model_on_what_it_never_saw_and_keeps_that_model(self):
        legs = synthetic.fleet(2500, seed=5)
        built, test = model.train(legs, "eta-test-a")
        self.assertEqual((test["verdict"], test["rankingVerdict"]), ("better", "better"), test.get("why"))
        for name in ("pickup", "drop"):
            self.assertLess(test[name]["model"]["mae"], test[name]["today"]["mae"])
        self.assertGreaterEqual(test["ranking"]["pairs"], model.MIN_PAIRS)
        self.assertGreaterEqual(test["ranking"]["model"], test["ranking"]["today"])
        self.assertLess(test["unseenRiders"]["pickup"]["model"]["mae"], test["unseenRiders"]["pickup"]["today"]["mae"])
        m = built["metrics"]
        self.assertEqual(m["trainLegs"] + m["testLegs"] + m["unseenRiderLegs"], len(legs), "no leg is counted twice or lost")
        self.assertGreater(m["unseenRiderLegs"], 0)
        self.assertEqual(m["riders"], 12)
        self.assertEqual(m["code"], fleet_eta.__version__)
        self.assertEqual(built["format"], 1)
        self.assertEqual(built["features"], features.FEATURES)
        # The model published is the one judged, not one trained again on the test legs.
        x, _ = model.matrix(legs)
        again = model.report(legs[-500:], built)
        self.assertEqual(again["legs"], 500)
        with self.assertRaises(ValueError):
            model.train(synthetic.fleet(model.MIN_LEGS - 1), "eta-test-b")

    def test_a_riders_usual_spot_teaches_the_model_nothing_about_the_spot(self):
        spot = (17.43, 78.45)
        legs = synthetic.fleet(3000, seed=9, slow_rider_spot=spot)
        x, y = model.matrix(legs)
        weighted = model.export(model.fit(x, y, sample_weight=model.weights(legs)), "w")
        plain = model.export(model.fit(x, y), "p")
        # Another rider sets off from the same spot to the first kitchen, at a quiet hour.
        k_lat, k_lng = synthetic.KITCHENS[0]
        at = synthetic.START_MS + 3 * features.HOUR_MS
        probe = [features.row(features.PICKUP, spot[0], spot[1], k_lat, k_lng, at)]
        fair = statistics.median(synthetic.minutes(random.Random(i), features.PICKUP, spot[0], spot[1], k_lat, k_lng, at)
                                 for i in range(201))
        self.assertLess(abs(model.serve(weighted, probe)[0] - fair), abs(model.serve(plain, probe)[0] - fair),
                        "weighing each rider once per spot should keep one slow rider from slowing the spot")

    def test_each_rider_weighs_one_in_each_place_they_set_off_from(self):
        legs = synthetic.fleet(1200, seed=4)
        w = model.weights(legs)
        sums = collections.defaultdict(float)
        for leg, weight in zip(legs, w):
            if leg[0] == features.PICKUP:
                sums[(leg[8], round(leg[1], 2), round(leg[2], 2))] += weight
            else:
                self.assertEqual(weight, 1.0)
        for total in sums.values():
            self.assertAlmostEqual(total, 1.0)

    def test_ranking_is_judged_on_riders_to_the_same_kitchen_at_about_the_same_time(self):
        at = 1793160000000
        legs = [model.Leg(features.PICKUP, 17.44, 78.39, 17.4483, 78.3915, at, 5.0),
                model.Leg(features.PICKUP, 17.45, 78.40, 17.4484, 78.3916, at + 600_000, 8.0),
                model.Leg(features.PICKUP, 17.45, 78.40, 17.4484, 78.3916, at + 3 * features.HOUR_MS, 2.0),  # hours later
                model.Leg(features.PICKUP, 17.45, 78.40, 17.50, 78.50, at, 3.0)]  # another kitchen
        self.assertEqual(model.concordance(legs, [4.0, 9.0, 0.0, 0.0]), (1.0, 1))
        self.assertEqual(model.concordance(legs, [9.0, 4.0, 0.0, 0.0]), (0.0, 1))

    def test_minutes_and_ranking_are_judged_apart(self):
        def leg(model_mae, today_mae, legs=100):
            return {"legs": legs, "model": {"mae": model_mae}, "today": {"mae": today_mae}}
        good = {"pickup": leg(2, 3), "drop": leg(4, 5), "ranking": {"pairs": 50, "model": 0.8, "today": 0.7}}
        self.assertEqual(model.judge(good, {"pickup": leg(2, 3)}, True), ("better", "better", []))
        self.assertEqual(model.judge({**good, "drop": leg(6, 5)}, {"pickup": leg(2, 3)}, True)[0], "worse")
        self.assertEqual(model.judge(good, {"pickup": leg(4, 3)}, True)[0], "worse", "worse for riders it never saw")
        self.assertEqual(model.judge(good, None, True)[0], "too-few", "riders known but too few to hold any out")
        self.assertEqual(model.judge(good, None, False)[:2], ("better", "better"), "an export without riders can't be checked for them")
        # Better minutes on average needn't rank riders any better: then it may be shown, but not decide who hears first.
        self.assertEqual(model.judge({**good, "ranking": {"pairs": 50, "model": 0.6, "today": 0.7}}, None, False)[:2],
                         ("better", "not-better"))
        self.assertEqual(model.judge({**good, "ranking": {"pairs": 10, "model": 0.9, "today": 0.7}}, None, False)[:2],
                         ("better", "too-few"))

    def test_served_minutes_stay_within_what_a_ride_can_take(self):
        def flat(minutes):
            return {"init": minutes, "learning_rate": 1.0, "trees": []}
        five_km = [features.row(features.DROP, 17.4483, 78.3915, 17.4483 + 5000 / 111_194.93, 78.3915, 1793160000000)]
        self.assertAlmostEqual(model.serve(flat(0.5), five_km)[0], five_km[0][0] / 1000, places=9, msg="no faster than 60 km/h")
        self.assertEqual(model.serve(flat(200.0), five_km)[0], 120.0)
        self.assertEqual(model.serve(flat(17.0), five_km)[0], 17.0)

    def test_implausible_legs_are_left_out_and_old_exports_still_read(self):
        with tempfile.TemporaryDirectory() as d:
            path = pathlib.Path(d) / "legs.csv"
            with open(path, "w", newline="") as f:
                w = csv.writer(f)
                w.writerow(["leg", "from_lat", "from_lng", "to_lat", "to_lng", "start_ms", "minutes"])
                w.writerow([0, 17.44, 78.39, 17.45, 78.40, 1793160000000, 6.5])  # kept
                w.writerow([1, 17.44, 78.39, 17.45, 78.40, 1793160000001, 0.5])  # 1.5 km in half a minute
                w.writerow([1, 17.44, 78.39, 17.45, 78.40, 1793160000002, 180])  # over two hours
                w.writerow([1, 17.44, 78.39, 17.80, 78.40, 1793160000003, 60])  # 40 km
                w.writerow([1, 17.44, 78.39, 17.54, 78.39, 1793160000004, 5])  # 11 km in 5 minutes
                w.writerow([2, 17.44, 78.39, 17.45, 78.40, 1793160000005, 6])  # no such leg
                w.writerow([0, "x", 78.39, 17.45, 78.40, 1793160000006, 6])  # not a number
            legs, dropped = model.read_legs(path)
            self.assertEqual(len(legs), 1)
            self.assertEqual(dropped, 6)
            self.assertEqual((legs[0].group, legs[0].rule_metres, legs[0].metres), (-1, None, None))
            with open(path, "w", newline="") as f:
                w = csv.writer(f)
                w.writerow(["leg", "from_lat", "from_lng", "to_lat", "to_lng", "metres", "bearing_sin", "bearing_cos", "start_ms",
                            "minutes", "rule_metres", "rider_group"])
                w.writerow([0, 17.440, 78.390, 17.448, 78.392, 912.4, 0.25, 0.97, 1793160000000, 4.25, 1186, 3])
                w.writerow([0, 17.440, 78.390, 17.448, 78.392, 912.4, 0.25, 0.97, 1793160900000, 0.2, 1186, 3])  # 15 s is the least
            legs, dropped = model.read_legs(path)
        self.assertEqual(dropped, 1)
        self.assertEqual((legs[0].group, legs[0].rule_metres, legs[0].metres), (3, 1186.0, 912.4))
        x, _ = model.matrix(legs)
        self.assertEqual((x[0][0], x[0][5], x[0][6]), (912.4, 0.25, 0.97), "the exact distance and bearing, not the rounded ends'")
        self.assertAlmostEqual(model.rule_minutes(legs)[0], 1186 / 333.0)

    def test_only_a_better_version_is_published_and_a_taken_version_is_refused(self):
        built, test = model.train(synthetic.fleet(2500, seed=7), "eta-test-c")
        self.assertEqual(test["verdict"], "better", test.get("why"))
        sql = model.publish_sql(built)
        self.assertTrue(sql.startswith("INSERT INTO fleet_schema.eta_model (version, model, metrics)"))
        self.assertIn("'eta-test-c'", sql)
        self.assertIn("ON CONFLICT (version) DO NOTHING;", sql)
        self.assertIn("already holds another model", sql)
        body = sql.split("$eta_model$")[1]
        self.assertEqual(json.loads(body)["version"], "eta-test-c")
        built["metrics"]["heldOutTest"]["verdict"] = "worse"
        with self.assertRaises(ValueError):
            model.publish_sql(built)

    def test_the_cli_writes_only_a_better_model_and_evaluates_only_newer_legs(self):
        with tempfile.TemporaryDirectory() as d:
            legs = pathlib.Path(d) / "legs.csv"
            rows = synthetic.fleet(2500, seed=11)
            with open(legs, "w", newline="") as f:
                w = csv.writer(f)
                w.writerow(["leg", "from_lat", "from_lng", "to_lat", "to_lng", "start_ms", "minutes", "rule_metres", "rider_group",
                            "metres", "bearing_sin", "bearing_cos"])
                w.writerows(rows)
            out = pathlib.Path(d) / "m.json"
            self.assertEqual(cli.main(["train", "--legs", str(legs), "--version", "eta-cli-a", "--out", str(out)]), 0)
            m = cli.load(out)
            self.assertEqual(m["version"], "eta-cli-a")
            self.assertEqual(len(m["metrics"]["dataSha256"]), 64)
            self.assertEqual(cli.main(["evaluate", "--legs", str(legs), "--model", str(out)]), 2, "every leg is one it saw")
            later = pathlib.Path(d) / "later.csv"
            with open(later, "w", newline="") as f:
                w = csv.writer(f)
                w.writerow(["leg", "from_lat", "from_lng", "to_lat", "to_lng", "start_ms", "minutes", "rule_metres", "rider_group",
                            "metres", "bearing_sin", "bearing_cos"])
                shift = 40 * features.DAY_MS
                w.writerows([(*r[:5], r[5] + shift, *r[6:]) for r in synthetic.fleet(400, seed=12)])
            self.assertEqual(cli.main(["evaluate", "--legs", str(later), "--model", str(out)]), 0)
            self.assertEqual(cli.main(["sql", "--model", str(out)]), 0)
            # Today's rule exactly right: no model beats it, and nothing is written.
            exact = pathlib.Path(d) / "exact.csv"
            with open(exact, "w", newline="") as f:
                w = csv.writer(f)
                w.writerow(["leg", "from_lat", "from_lng", "to_lat", "to_lng", "start_ms", "minutes", "rule_metres", "rider_group"])
                w.writerows([(*r[:6], round(r[7] / 333.0, 3), r[7], r[8]) for r in rows])
            refused = pathlib.Path(d) / "refused.json"
            self.assertIn(cli.main(["train", "--legs", str(exact), "--version", "eta-cli-b", "--out", str(refused)]), (1, 2))
            self.assertFalse(refused.exists())
            with self.assertRaises(SystemExit):
                cli.main(["train", "--legs", str(legs), "--version", "no spaces please", "--out", str(out)])


class GoldenTest(unittest.TestCase):
    def test_the_golden_file_is_consistent(self):
        g = json.loads(GOLDEN.read_text())
        self.assertEqual(g["model"]["features"], features.FEATURES)
        x = [r["features"] for r in g["rows"]]
        np.testing.assert_array_equal(model.predict(g["model"], x, clamp=False), [r["minutes"] for r in g["rows"]])
        for r in g["rows"]:
            self.assertEqual(features.row(r["leg"], r["fromLat"], r["fromLng"], r["toLat"], r["toLng"], r["atMs"]), r["features"])


if __name__ == "__main__":
    unittest.main()
